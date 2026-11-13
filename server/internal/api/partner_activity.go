package api

import (
	"doubo/server/internal/core"
	"net/http"
)

func (a *Server) partnerActivity(w http.ResponseWriter, r *http.Request) {
	if !a.inPartnerScope(w, r, r.PathValue("id")) {
		return
	}
	logs := a.auditStore(w)
	if logs == nil {
		return
	}
	before := r.URL.Query().Get("before")
	if len(before) > 26 {
		fail(w, 400, "分页参数无效")
		return
	}
	page, err := logs.Logs(r.Context(), core.AuditQuery{MembersOnly: identity(r).AdminRole != core.SuperAdminRole && identity(r).PartnerID == r.PathValue("id"), PartnerID: r.PathValue("id"), Categories: []string{core.LogBusiness, core.LogAuth, core.LogAPI}, Before: before, Limit: 50})
	if err != nil {
		dbError(w, err)
		return
	}
	// Activity inspection does not grant access to raw requests, credentials or device data.
	for i, e := range page.Items {
		page.Items[i] = core.AuditEntry{ID: e.ID, At: e.At, Category: e.Category, Action: e.Action, ActorType: e.ActorType, ActorID: e.ActorID, ActorName: e.ActorName, Status: e.Status, Summary: e.Summary}
	}
	reply(w, 200, page)
}
