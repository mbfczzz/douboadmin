package api

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"net/http"
)

func (a *Server) platform(ctx context.Context) (core.Record, core.PlatformSettings, error) {
	s := core.DefaultPlatform()
	r, e := a.Store.Get(ctx, "settings", "platform")
	if errors.Is(e, core.ErrNotFound) {
		return core.Record{ID: "platform", Data: core.Data(s)}, s, nil
	}
	// Retain the version for older clients, but never apply retired business rules.
	r.Data = core.Data(s)
	return r, s, e
}
func (a *Server) platformSettings(w http.ResponseWriter, r *http.Request) {
	row, _, e := a.platform(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]any{"record": row, "capabilities": map[string]bool{
		"payment": a.rechargeReady(), "oss": a.Objects != nil, "hot": a.Hot.Ready(),
		"subscription": a.Config.CompletionReady,
	}})
}
func (a *Server) savePlatform(w http.ResponseWriter, r *http.Request) {
	fail(w, http.StatusGone, "业务设置已移除，请在支付接入配置中管理积分套餐")
}

func (a *Server) preferences(w http.ResponseWriter, r *http.Request) {
	user := identity(r).ID
	row, e := a.Store.Get(r.Context(), "preferences", user)
	if errors.Is(e, core.ErrNotFound) {
		row = core.Record{ID: user, Owner: user, Data: core.Data(core.DefaultPreferences())}
		e = nil
	}
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
func (a *Server) savePreferences(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64                `json:"version"`
		Data    core.UserPreferences `json:"data"`
	}
	if !decode(w, r, &v) {
		return
	}
	user := identity(r).ID
	row, e := a.Store.Put(r.Context(), "preferences", core.Record{ID: user, Owner: user, Data: core.Data(v.Data)}, v.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
