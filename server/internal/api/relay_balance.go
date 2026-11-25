package api

import (
	"context"
	"doubo/server/internal/relay"
	"errors"
	"net/http"
	"time"
)

func (a *Server) relayBalance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !a.Relay.Ready() {
		fail(w, 503, "中转站尚未配置，请先配置服务接入")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	balance, err := a.Relay.Balance(ctx)
	if err != nil {
		message := "算力余额查询失败，请稍后重试"
		var upstream *relay.HTTPError
		if errors.As(err, &upstream) {
			switch upstream.Status {
			case 401, 403:
				message = "中转站客户 Key 无效或已停用，请检查服务接入配置"
			case 404:
				message = "当前中转站暂不支持余额查询接口"
			case 500:
				message = "算力余额读取失败，请稍后重试"
			}
		} else if ctx.Err() != nil {
			message = "算力余额查询超时，请重试"
		}
		fail(w, 502, message)
		return
	}
	reply(w, 200, map[string]any{"balance": balance.Balance, "unit": balance.Unit, "checkedAt": time.Now().UTC()})
}
