package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"doubo/server/internal/core"
)

// Platform-wide registration search. Only super administrators can activate;
// providers retain scoped inspection and rejection from their own records.
func (a *Server) registrationList(w http.ResponseWriter, r *http.Request) {
	if !platformOnly(w, r) {
		return
	}
	q := r.URL.Query()
	page, e := strconv.Atoi(q.Get("page"))
	if e != nil || page < 1 {
		page = 1
	}
	status := q.Get("status")
	if status != "" && status != "pending" && status != "approved" && status != "rejected" || len([]rune(q.Get("q"))) > 100 {
		fail(w, 400, "查询条件无效")
		return
	}
	a.replyRegistrations(w, r, core.RecordQuery{Namespace: "registrations", Status: status, Search: q.Get("q"), Page: page, Size: 20})
}

// This separate member inbox keeps pending old-code registrations reachable
// without mixing historical codes into the currently displayed QR's records.
func (a *Server) memberRegistrations(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !a.inPartnerScope(w, r, id) {
		return
	}
	page, ok := providerPageNumber(w, r)
	if !ok {
		return
	}
	status := r.URL.Query().Get("status")
	if status != "" && status != "pending" && status != "approved" && status != "rejected" {
		fail(w, 400, "登记状态无效")
		return
	}
	a.replyRegistrations(w, r, core.RecordQuery{Namespace: "registrations", PartnerID: id,
		Fields: map[string]string{"role": "member"}, Status: status,
		Search: r.URL.Query().Get("q"), Page: page, Size: 20})
}

func (a *Server) replyRegistrations(w http.ResponseWriter, r *http.Request, query core.RecordQuery) {
	rows, e := a.Store.RecordPage(r.Context(), query)
	if e == nil {
		for i := range rows.Items {
			var reg core.Registration
			if e = json.Unmarshal(rows.Items[i].Data, &reg); e != nil {
				break
			}
			approve := canApproveRegistrations(r)
			reject := approve
			if !reject {
				reject, e = a.Partners.CanReviewRegistration(r.Context(), reg, registrationReviewer(r))
			}
			if e != nil {
				break
			}
			rows.Items[i].Data = core.Data(struct {
				core.Registration
				CanReview  bool `json:"canReview"` // Legacy clients also hide approval.
				CanApprove bool `json:"canApprove"`
				CanReject  bool `json:"canReject"`
			}{reg, approve, approve, reject})
		}
	}
	partnerResult(w, rows, e)
}

func (a *Server) decideRegistration(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Approve bool   `json:"approve"`
		Reason  string `json:"reason"`
		Version int64  `json:"version"`
	}
	if !decode(w, r, &v) {
		return
	}
	if canApproveRegistrations(r) {
		out, e := a.Partners.Decide(r.Context(), r.PathValue("id"), v.Approve, v.Reason, v.Version, identity(r).ID)
		partnerResult(w, out, e)
		return
	}
	if v.Approve {
		fail(w, 403, "仅超级管理员可开通账号")
		return
	}
	out, e := a.Partners.DecideForProvider(r.Context(), r.PathValue("id"), v.Approve, v.Reason, v.Version, identity(r).ID, registrationReviewer(r))
	partnerResult(w, out, e)
}

func (a *Server) registrationForReview(w http.ResponseWriter, r *http.Request) {
	if canApproveRegistrations(r) {
		row, e := a.Store.Get(r.Context(), "registrations", r.PathValue("id"))
		partnerResult(w, row, e)
		return
	}
	row, e := a.Partners.RegistrationForReview(r.Context(), r.PathValue("id"), registrationReviewer(r))
	partnerResult(w, row, e)
}

func canApproveRegistrations(r *http.Request) bool {
	return identity(r).AdminRole == core.SuperAdminRole
}

func registrationReviewer(r *http.Request) string {
	if id := identity(r).PartnerID; id != "" {
		return id
	}
	return core.RootPartner
}

// myPromo is an active member's own promo code and its QR image.
func (a *Server) myPromo(w http.ResponseWriter, r *http.Request) {
	code, e := a.Partners.PromoCode(r.Context(), identity(r).ID)
	if e != nil {
		partnerError(w, e)
		return
	}
	qr, e := shareQR(code)
	if e != nil {
		fail(w, 503, "二维码生成失败")
		return
	}
	reply(w, 200, shareView{Code: code, QR: qr})
}
