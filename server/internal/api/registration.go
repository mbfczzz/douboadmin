package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strings"
)

// Registration always requires a name and valid phone. A configured SMS
// provider additionally requires proof that the user owns that phone.
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
	registered := strings.TrimSpace(p.Name) != "" && mainlandPhone.MatchString(p.Phone) && (!a.registrationRequired() || p.VerifiedPhone == p.Phone)
	return userFlags{Disabled: p.Disabled || p.Archived, Registered: registered, Name: p.Name, Phone: p.Phone}, nil
}

func (a *Server) userDisabled(ctx context.Context, id string) (bool, error) {
	f, e := a.userState(ctx, id)
	return f.Disabled, e
}

// accessView is what the mini-program needs to pick the next step.
type accessView struct {
	core.Access
	ProfileRequired           bool   `json:"profileRequired"`
	PhoneVerificationRequired bool   `json:"smsRequired"`
	Name                      string `json:"name,omitempty"`
	Phone                     string `json:"phone,omitempty"`
}

const errProfileRequired = "请先填写姓名并验证手机号"
const errBasicProfileRequired = "请先填写姓名和手机号"

func (a *Server) profileRequiredMessage() string {
	if a.registrationRequired() {
		return errProfileRequired
	}
	return errBasicProfileRequired
}

func (a *Server) accessFor(ctx context.Context, id string) (accessView, error) {
	flags, e := a.userState(ctx, id)
	if e != nil {
		return accessView{}, e
	}
	access, e := a.Partners.Access(ctx, id)
	if e != nil {
		return accessView{}, e
	}
	phoneRequired := a.registrationRequired()
	v := accessView{Access: access, ProfileRequired: !flags.Registered, PhoneVerificationRequired: phoneRequired}
	if v.ProfileRequired {
		v.Active, v.Message, v.Name, v.Phone = false, a.profileRequiredMessage(), flags.Name, flags.Phone
	}
	return v, nil
}
