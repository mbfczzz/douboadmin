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
func activationExempt(path string) bool {
	return path == "/api/access" || path == "/api/access/redeem" || path == "/api/auth/logout"
}
func (a *Server) allowActivation(w http.ResponseWriter, r *http.Request, user string) bool {
	if !a.Config.RequireActivation || activationExempt(r.URL.Path) {
		return true
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
	disabled, e := a.userDisabled(r.Context(), id.ID)
	if e != nil {
		return false, e
	}
	if disabled {
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
	access, e := a.Partners.Access(r.Context(), identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, access)
}
func (a *Server) redeemAccess(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Code   string `json:"code"`
		Method string `json:"method"`
	}
	if !decode(w, r, &input) {
		return
	}
	ok, e := a.Sessions.Allow(r.Context(), "activation:"+identity(r).ID, 10)
	if e != nil {
		dbError(w, e)
		return
	}
	if !ok {
		fail(w, 429, "激活尝试过于频繁，请稍后重试")
		return
	}
	access, e := a.Partners.Redeem(r.Context(), identity(r).ID, input.Code, input.Method)
	if e != nil {
		partnerError(w, e)
		return
	}
	reply(w, 200, access)
}
