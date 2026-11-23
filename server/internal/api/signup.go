package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// signupSettings controls whether a phone-registered user may use the
// platform without joining a provider. Missing settings stay closed.
type signupSettings struct {
	OpenSignup bool `json:"openSignup"`
}

func (a *Server) signup(ctx context.Context) (core.Record, signupSettings, error) {
	value := signupSettings{OpenSignup: false}
	row, err := a.Store.Get(ctx, "signup_settings", "platform")
	if errors.Is(err, core.ErrNotFound) {
		return core.Record{ID: "platform", Data: core.Data(value)}, value, nil
	}
	if err == nil && json.Unmarshal(row.Data, &value) != nil {
		err = fmt.Errorf("注册设置异常")
	}
	return row, value, err
}

func (a *Server) signupSettings(w http.ResponseWriter, r *http.Request) {
	row, _, err := a.signup(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, http.StatusOK, row)
}

func (a *Server) saveSignupSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version    int64 `json:"version"`
		OpenSignup *bool `json:"openSignup"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.OpenSignup == nil {
		fail(w, http.StatusBadRequest, "请选择是否开放普通用户注册")
		return
	}
	row, err := a.Store.Put(r.Context(), "signup_settings", core.Record{
		ID: "platform", Data: core.Data(signupSettings{OpenSignup: *input.OpenSignup}),
	}, input.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, http.StatusOK, row)
}
