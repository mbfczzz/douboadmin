package api

import (
	"doubo/server/internal/core"
	"errors"
	"net/http"
	"strings"
)

func tokenFrom(r *http.Request) string {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if c, e := r.Cookie("doubo_session"); e == nil && token == "" {
		token = c.Value
	}
	return token
}

// The registration and activation steps themselves stay reachable.
var activationSteps = map[string]bool{"/api/access": true, "/api/access/sms": true, "/api/access/profile": true,
	"/api/access/join": true, "/api/auth/logout": true}

func activationExempt(path string) bool { return activationSteps[path] }
func (a *Server) allowActivation(w http.ResponseWriter, r *http.Request, user string, registered bool) bool {
	if !a.Config.RequireActivation || activationExempt(r.URL.Path) {
		return true
	}
	if !registered {
		reply(w, 403, map[string]any{"code": "ACTIVATION_REQUIRED", "error": a.profileRequiredMessage(), "access": accessView{Access: core.Access{Status: "pending"}, ProfileRequired: true, PhoneVerificationRequired: a.registrationRequired()}})
		return false
	}
	access, e := a.Partners.Access(r.Context(), user)
	if e != nil {
		dbError(w, e)
		return false
	}
	if access.Active {
		return true
	}
	message := access.Message
	if message == "" {
		message = core.ErrActivationRequired.Error()
	}
	reply(w, 403, map[string]any{"code": "ACTIVATION_REQUIRED", "error": message, "access": access})
	return false
}
func (a *Server) business(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.Config.RequireActivation {
			h(w, r)
			return
		}
		a.auth("", h)(w, r)
	}
}
func (a *Server) fullConfig(r *http.Request) (bool, error) {
	if !a.Config.RequireActivation {
		return true, nil
	}
	id, e := a.Sessions.Get(r.Context(), tokenFrom(r))
	if errors.Is(e, core.ErrNotFound) {
		return false, nil
	}
	if e != nil {
		return false, e
	}
	if id.Role == "admin" {
		return true, nil
	}
	if id.Role != "user" {
		return false, nil
	}
	flags, e := a.userState(r.Context(), id.ID)
	if e != nil {
		return false, e
	}
	if flags.Disabled || !flags.Registered {
		return false, nil
	}
	access, e := a.Partners.Access(r.Context(), id.ID)
	return access.Active, e
}
func (a *Server) myAccess(w http.ResponseWriter, r *http.Request) {
	if !a.Config.RequireActivation {
		reply(w, 200, core.Access{Active: true, Status: "active"})
		return
	}
	access, e := a.accessFor(r.Context(), identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, access)
}

// registeredOnly refuses the activation step before the registration step.
func (a *Server) registeredOnly(w http.ResponseWriter, r *http.Request) bool {
	flags, e := a.userState(r.Context(), identity(r).ID)
	if e != nil {
		dbError(w, e)
		return false
	}
	if !flags.Registered {
		reply(w, 403, map[string]string{"code": "PROFILE_REQUIRED", "error": a.profileRequiredMessage()})
		return false
	}
	return true
}
func (a *Server) joinAccess(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Code   string `json:"code"`
		Method string `json:"method"`
	}
	if !decode(w, r, &input) || !a.registeredOnly(w, r) {
		return
	}
	ok, e := a.Sessions.Allow(r.Context(), "join:"+identity(r).ID, 10)
	if e != nil {
		dbError(w, e)
		return
	}
	if !ok {
		fail(w, 429, "加入尝试过于频繁，请稍后重试")
		return
	}
	access, e := a.Partners.Join(r.Context(), identity(r).ID, input.Code, input.Method)
	if e != nil {
		partnerError(w, e)
		return
	}
	reply(w, 200, access)
}
