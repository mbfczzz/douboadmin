package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/wechat"
	"errors"
	"net/http"
	"time"
)

func (a *Server) demoLoginEnabled() bool { return a.Config.DemoLogin && !a.Config.Production }
func (a *Server) login(w http.ResponseWriter, r *http.Request) {
	if !a.loginLimit(w, r) {
		return
	}
	var v struct {
		Code   string `json:"code"`
		DemoID string `json:"demoId"`
	}
	if !decode(w, r, &v) {
		return
	}
	if (v.Code == "") == (v.DemoID == "") {
		fail(w, 400, "请提供微信登录凭证")
		return
	}
	id, provider := "", "wechat"
	if v.DemoID != "" {
		if !a.demoLoginEnabled() || r.URL.Path == "/api/auth/wechat" {
			fail(w, 403, "演示登录未启用")
			return
		}
		if len(v.DemoID) < 16 || len(v.DemoID) > 80 {
			fail(w, 400, "演示设备标识无效")
			return
		}
		id = "demo-" + core.Digest(v.DemoID)[:24]
		provider = "demo"
	} else {
		openID, err := a.WeChat.Exchange(r.Context(), v.Code)
		if err != nil {
			status := http.StatusBadGateway
			switch {
			case errors.Is(err, wechat.ErrInvalidCode):
				status = 401
			case errors.Is(err, wechat.ErrNotConfigured):
				status = 503
			case errors.Is(err, wechat.ErrRateLimited):
				status = 429
			case errors.Is(err, wechat.ErrRejected):
				status = 403
			}
			fail(w, status, err.Error())
			return
		}
		id = "wx-" + core.Digest(a.Config.WeChatAppID + openID)[:32]
		if e := a.saveWeChatIdentity(r.Context(), id, openID); e != nil {
			dbError(w, e)
			return
		}
	}
	isNew := false
	if _, err := a.Store.Get(r.Context(), "users", id); errors.Is(err, core.ErrNotFound) {
		_, err = a.Store.Put(r.Context(), "users", core.Record{ID: id, Owner: id, Data: core.Data(map[string]string{"nickname": "微信用户", "bio": "记录每一个闪光的创意", "authProvider": provider})}, 0)
		if err != nil && !errors.Is(err, core.ErrConflict) {
			dbError(w, err)
			return
		}
		isNew = err == nil
	} else if err != nil {
		dbError(w, err)
		return
	}
	token, err := a.Sessions.Create(r.Context(), id, "user")
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, map[string]any{"activationRequired": a.Config.RequireActivation, "token": token, "userId": id, "expiresIn": int((24 * time.Hour).Seconds()), "isNewUser": isNew, "provider": provider})
}
