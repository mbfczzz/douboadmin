package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// A mini-program user is registered once they have a name and a phone number
// confirmed by SMS. Until then every business endpoint answers
// ACTIVATION_REQUIRED and the mini-program shows the registration step.
type userFlags struct {
	Disabled, Registered bool
	Name, Phone          string
}

func (a *Server) userState(ctx context.Context, id string) (userFlags, error) {
	row, e := a.Store.Get(ctx, "users", id)
	if e != nil {
		return userFlags{}, e
	}
	var p *struct {
		Disabled      bool   `json:"disabled"`
		Archived      bool   `json:"archived"`
		Name          string `json:"name"`
		Phone         string `json:"phone"`
		VerifiedPhone string `json:"verifiedPhone"`
	}
	if json.Unmarshal(row.Data, &p) != nil || p == nil {
		return userFlags{}, fmt.Errorf("账号状态异常")
	}
	// Changing the phone (for example by an administrator) asks for a new SMS
	// check. While SMS is not configured nobody is held at this step.
	registered := !a.registrationRequired() || strings.TrimSpace(p.Name) != "" && p.Phone != "" && p.VerifiedPhone == p.Phone
	return userFlags{Disabled: p.Disabled || p.Archived, Registered: registered, Name: p.Name, Phone: p.Phone}, nil
}

func (a *Server) userDisabled(ctx context.Context, id string) (bool, error) {
	f, e := a.userState(ctx, id)
	return f.Disabled, e
}

// accessView is what the mini-program needs to pick the next step.
type accessView struct {
	core.Access
	ProfileRequired bool   `json:"profileRequired"`
	OpenSignup      bool   `json:"openSignup"`
	Name            string `json:"name,omitempty"`
	Phone           string `json:"phone,omitempty"`
}

const errProfileRequired = "请先填写姓名并验证手机号"

func (a *Server) accessFor(ctx context.Context, id string) (accessView, error) {
	flags, e := a.userState(ctx, id)
	if e != nil {
		return accessView{}, e
	}
	access, e := a.Partners.Access(ctx, id)
	if e != nil {
		return accessView{}, e
	}
	_, signup, e := a.signup(ctx)
	v := accessView{Access: access, OpenSignup: signup.OpenSignup, ProfileRequired: !flags.Registered}
	if v.ProfileRequired {
		v.Active, v.Message, v.Name, v.Phone = false, errProfileRequired, flags.Name, flags.Phone
	}
	return v, e
}

// Registration settings: whether users may skip the provider code.
type signupSettings struct {
	OpenSignup bool `json:"openSignup"`
}

func (a *Server) signup(ctx context.Context) (core.Record, signupSettings, error) {
	s := signupSettings{OpenSignup: true} // matches the behaviour before the switch existed
	row, e := a.Store.Get(ctx, "settings", "signup")
	if errors.Is(e, core.ErrNotFound) {
		return core.Record{ID: "signup", Data: core.Data(s)}, s, nil
	}
	if e == nil && json.Unmarshal(row.Data, &s) != nil {
		e = fmt.Errorf("注册设置异常")
	}
	return row, s, e
}

func (a *Server) signupSettings(w http.ResponseWriter, r *http.Request) {
	row, _, e := a.signup(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}

func (a *Server) saveSignupSettings(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version    int64 `json:"version"`
		OpenSignup *bool `json:"openSignup"`
	}
	if !decode(w, r, &v) {
		return
	}
	if identity(r).PartnerID != "" {
		fail(w, 403, "注册开关由平台管理员设置")
		return
	}
	if v.OpenSignup == nil {
		fail(w, 400, "请选择是否开放普通用户注册")
		return
	}
	row, e := a.Store.Put(r.Context(), "settings", core.Record{ID: "signup", Data: core.Data(signupSettings{*v.OpenSignup})}, v.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
