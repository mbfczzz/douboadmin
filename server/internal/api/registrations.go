package api

import (
	"net/http"
	"strconv"

	"doubo/server/internal/core"
)

// Scan registrations wait here until the platform (总部) opens them.
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
	rows, e := a.Store.RecordPage(r.Context(), core.RecordQuery{Namespace: "registrations", Status: status, Search: q.Get("q"), Page: page, Size: 20})
	partnerResult(w, rows, e)
}

func (a *Server) decideRegistration(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Approve bool   `json:"approve"`
		Reason  string `json:"reason"`
		Version int64  `json:"version"`
	}
	if !decode(w, r, &v) || !platformOnly(w, r) {
		return
	}
	out, e := a.Partners.Decide(r.Context(), r.PathValue("id"), v.Approve, v.Reason, v.Version, identity(r).ID)
	partnerResult(w, out, e)
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
