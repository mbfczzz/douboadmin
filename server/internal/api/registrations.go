package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"doubo/server/internal/core"
	"doubo/server/internal/partners"
)

// Platform-wide registration search. Super administrators decide everything;
// a provider with 下级小程序开通权限 decides registrations below it.
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
	if identity(r).PartnerID != "" && !a.providerMayDecide(w, r) {
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
		FieldsIn: map[string][]string{"role": {core.RoleMember, core.RoleVisitor}}, Status: status,
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
			if !approve {
				if approve, e = a.Partners.CanDecideRegistration(r.Context(), reg, registrationReviewer(r)); e != nil {
					break
				}
			}
			reject := approve
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
	if !canApproveRegistrations(r) && !a.providerMayDecide(w, r) {
		return
	}
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
	qr, e := a.shareQR(r.Context(), code)
	if e != nil {
		fail(w, 503, "二维码生成失败")
		return
	}
	reply(w, 200, shareView{Code: code, QR: qr})
}

// setActivationRight is the super administrator's 下级小程序开通权限 switch for
// one 分公司 / 一级服务商 / 二级服务商.
func (a *Server) setActivationRight(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Enabled bool  `json:"enabled"`
		Version int64 `json:"version"`
	}
	if !decode(w, r, &v) {
		return
	}
	out, e := a.Partners.SetActivationRight(r.Context(), r.PathValue("id"), v.Enabled, v.Version, identity(r).ID)
	partnerResult(w, out, e)
}

// providerMayDecide answers 403 unless this provider login holds 下级小程序开通
// 权限; each registration is still checked against its subtree.
func (a *Server) providerMayDecide(w http.ResponseWriter, r *http.Request) bool {
	ok, e := a.Partners.CanActivateChildren(r.Context(), registrationReviewer(r))
	if e != nil {
		dbError(w, e)
		return false
	}
	if !ok {
		fail(w, 403, partners.ErrApprovalDenied.Error())
	}
	return ok
}
