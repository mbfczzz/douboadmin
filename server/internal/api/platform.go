package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
)

func (a *Server) platform(ctx context.Context) (core.Record, core.PlatformSettings, error) {
	s := core.DefaultPlatform()
	r, e := a.Store.Get(ctx, "settings", "platform")
	if errors.Is(e, core.ErrNotFound) {
		return core.Record{ID: "platform", Data: core.Data(s)}, s, nil
	}
	if e == nil {
		e = json.Unmarshal(r.Data, &s)
		r.Data = core.Data(s)
	}
	return r, s, e
}
func (a *Server) platformSettings(w http.ResponseWriter, r *http.Request) {
	row, _, e := a.platform(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]any{"record": row, "capabilities": map[string]bool{
		"payment": a.Pay.Ready(), "oss": a.Objects != nil, "hot": a.Hot.Ready(),
		"subscription": a.Config.CompletionReady,
	}})
}
func (a *Server) savePlatform(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64                 `json:"version"`
		Data    core.PlatformSettings `json:"data"`
	}
	if !decode(w, r, &v) {
		return
	}
	if e := v.Data.Validate(); e != nil {
		fail(w, 400, e.Error())
		return
	}
	if v.Data.RechargeEnabled && !a.Pay.Ready() {
		fail(w, 400, "请先配置并开通微信支付，再启用充值")
		return
	}
	row, e := a.Store.Put(r.Context(), "settings", core.Record{ID: "platform", Data: core.Data(v.Data)}, v.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
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
