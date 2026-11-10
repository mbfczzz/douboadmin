package api

import (
	"encoding/json"
	"net/http"

	"doubo/server/internal/core"
)

type boundUser struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	Name     string `json:"name"`
	Phone    string `json:"phone"`
}

// replyBind shows a provider's bind code, or the account it has bound.
func (a *Server) replyBind(w http.ResponseWriter, r *http.Request, v core.PartnerShare, e error) {
	if e != nil {
		partnerError(w, e)
		return
	}
	if v.User == "" {
		replyShare(w, v, nil)
		return
	}
	u := boundUser{ID: v.User}
	if row, err := a.Store.Get(r.Context(), "users", v.User); err == nil {
		_ = json.Unmarshal(row.Data, &u)
	}
	// Until the platform approves, the binding is only a registration.
	access, e := a.Partners.Access(r.Context(), v.User)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]any{"user": u, "pending": access.Status == "review"})
}

func (a *Server) unbind(w http.ResponseWriter, r *http.Request) {
	if a.belowPartner(w, r, r.PathValue("id")) {
		v, e := a.Partners.Unbind(r.Context(), r.PathValue("id"), identity(r).ID)
		a.replyBind(w, r, v, e)
	}
}
