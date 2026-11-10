package api

import "net/http"

func (a *Server) changeMembership(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Status  string `json:"status"`
		Reason  string `json:"reason"`
		Version int64  `json:"version"`
	}
	if !decode(w, r, &v) || !a.dataPartnerInScope(w, r, "memberships", r.PathValue("id")) {
		return
	}
	out, e := a.Partners.ChangeMembership(r.Context(), r.PathValue("id"), v.Status, v.Reason, identity(r).ID, v.Version)
	partnerResult(w, out, e)
}
