package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
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
		"payment": a.rechargeReady(), "oss": a.Objects != nil, "hot": a.Hot.Ready(),
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
	var row core.Record
	e := a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		if a.Integrations != nil {
			if _, err := tx.Lock("settings_control", core.Record{ID: "integrations", Data: core.Data(map[string]string{})}); err != nil {
				return err
			}
			if v.Data.RechargeEnabled {
				pending, err := a.Integrations.PendingPayment(tx)
				if err != nil {
					return err
				}
				if pending {
					return &settingsRestartError{}
				}
			}
		}
		if v.Data.RechargeEnabled && !a.rechargeReady() {
			return &paymentUnavailableError{}
		}
		var err error
		row, err = tx.Put("settings", core.Record{ID: "platform", Data: core.Data(v.Data)}, v.Version)
		return err
	})
	var restart *settingsRestartError
	if errors.As(e, &restart) {
		fail(w, 409, restart.Error())
		return
	}
	var unavailable *paymentUnavailableError
	if errors.As(e, &unavailable) {
		fail(w, 400, unavailable.Error())
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}

type settingsRestartError struct{}

type paymentUnavailableError struct{}

func (*paymentUnavailableError) Error() string {
	return "请先配置并开通微信支付，再启用充值"
}

func (*settingsRestartError) Error() string {
	return "微信或支付接入配置尚待重启应用，请先重启 API 和 Worker 后再开启充值"
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
