package api

import (
	"doubo/server/internal/core"
	"net/http"
)

func (a *Server) movePartnerQuota(w http.ResponseWriter, r *http.Request) {
	var v core.QuotaMove
	if !decode(w, r, &v) || !a.inPartnerScope(w, r, v.ParentID) {
		return
	}
	out, e := a.Partners.Transfer(r.Context(), v, r.Header.Get("Idempotency-Key"), identity(r).ID)
	partnerResult(w, out, e)
}
func (a *Server) requestPartnerQuota(w http.ResponseWriter, r *http.Request) {
	var v struct {
		PartnerID string `json:"partnerId"`
		Users     int64  `json:"users"`
		Partners  int64  `json:"partners"`
		Reason    string `json:"reason"`
	}
	if !decode(w, r, &v) || !a.inPartnerScope(w, r, v.PartnerID) {
		return
	}
	out, e := a.Partners.RequestQuota(r.Context(), v.PartnerID, v.Users, v.Partners, v.Reason, r.Header.Get("Idempotency-Key"), identity(r).ID)
	partnerResult(w, out, e)
}
func (a *Server) decidePartnerQuota(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64  `json:"version"`
		Approve bool   `json:"approve"`
		Reason  string `json:"reason"`
	}
	if !platformOnly(w, r) || !decode(w, r, &v) {
		return
	}
	out, e := a.Partners.DecideRequest(r.Context(), r.PathValue("id"), v.Approve, v.Reason, v.Version, identity(r).ID)
	partnerResult(w, out, e)
}
