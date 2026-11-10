package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
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
	ProfileRequired           bool   `json:"profileRequired"`
	PhoneVerificationRequired bool   `json:"smsRequired"`
	Name                      string `json:"name,omitempty"`
	Phone                     string `json:"phone,omitempty"`
}

const errProfileRequired = "请先填写姓名并验证手机号"
const errNameRequired = "请先填写姓名"

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
	// Skipping unavailable SMS must not skip a new user's name. Existing
	// active accounts retain access while SMS is unavailable.
	v := accessView{Access: access, ProfileRequired: !flags.Registered || !access.Active && strings.TrimSpace(flags.Name) == "", PhoneVerificationRequired: phoneRequired}
	if v.ProfileRequired {
		v.Active, v.Message, v.Name, v.Phone = false, errProfileRequired, flags.Name, flags.Phone
		if !phoneRequired {
			v.Message = errNameRequired
		}
	}
	return v, nil
}
