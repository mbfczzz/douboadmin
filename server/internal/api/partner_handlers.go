package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"errors"
	"net/http"
	"slices"
	"strconv"
)

func partnerError(w http.ResponseWriter, e error) {
	var rule *partners.RuleError
	switch {
	case errors.Is(e, partners.ErrRatioAccess), errors.Is(e, partners.ErrReviewDenied), errors.Is(e, partners.ErrApprovalDenied):
		fail(w, 403, e.Error())
	case errors.As(e, &rule):
		fail(w, 400, e.Error())
	case errors.Is(e, core.ErrActivationRequired), errors.Is(e, core.ErrPartnerDisabled):
		fail(w, 403, e.Error())
	default:
		dbError(w, e)
	}
}
func partnerResult(w http.ResponseWriter, result any, e error) {
	if e != nil {
		partnerError(w, e)
		return
	}
	reply(w, 200, result)
}
func (a *Server) partnerList(ns string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		page := 1
		if q.Get("page") != "" {
			n, e := strconv.Atoi(q.Get("page"))
			if e != nil || n < 1 || n > 1000000 {
				fail(w, 400, "页码无效")
				return
			}
			page = n
		}
		if len([]rune(q.Get("q"))) > 100 || len(q.Get("owner")) > 64 || len(q.Get("provider")) > 64 || len(q.Get("status")) > 30 {
			fail(w, 400, "查询条件无效")
			return
		}
		query := core.RecordQuery{Namespace: ns, Owner: q.Get("owner"), PartnerID: q.Get("provider"), Search: q.Get("q"), Status: q.Get("status"), Page: page, Size: 20}
		if ns == "memberships" && q.Has("code") {
			code, valid := partners.NormalizeShareCode(q.Get("code"))
			if !valid {
				fail(w, 400, "二维码无效")
				return
			}
			query.Fields = map[string]string{"codeId": code}
		}
		scope, e := a.partnerScope(r)
		if e != nil {
			dbError(w, e)
			return
		}
		if scope != nil {
			for _, id := range []string{query.Owner, query.PartnerID} {
				if id != "" && !a.inPartnerScope(w, r, id) {
					return
				}
			}
			// Memberships are keyed by user and carry the provider in data.
			if ns == "memberships" {
				query.PartnerIn = scope
			} else {
				query.OwnerIn = scope
			}
		}
		rows, e := a.Store.RecordPage(r.Context(), query)
		partnerResult(w, rows, e)
	}
}
func (a *Server) partnerTree(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Has("page") {
		a.providerTreePage(w, r)
		return
	}
	rows, e := a.Partners.Tree(r.Context())
	scope, se := a.partnerScope(r)
	if e == nil && se != nil {
		e = se
	}
	if e == nil && scope != nil {
		visible := rows[:0]
		for _, row := range rows {
			if slices.Contains(scope, row.ID) {
				visible = append(visible, row)
			}
		}
		rows = visible
	}
	partnerResult(w, rows, e)
}
func (a *Server) partnerOverview(w http.ResponseWriter, r *http.Request) {
	if !a.inPartnerScope(w, r, r.PathValue("id")) {
		return
	}
	out, e := a.Partners.Overview(r.Context(), r.PathValue("id"))
	if identity(r).AdminRole != core.SuperAdminRole {
		out.Price = partners.Price{}
		out.PriceError = ""
	}
	partnerResult(w, out, e)
}
func (a *Server) updatePartner(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64        `json:"version"`
		Data    core.Partner `json:"data"`
	}
	if !decode(w, r, &v) {
		return
	}
	if !a.belowPartner(w, r, r.PathValue("id")) || !a.accountOrPricingOnly(w, r, v.Data) || !a.withinOwnPricing(w, r, r.PathValue("id"), v.Data) {
		return
	}
	if identity(r).AdminRole != core.SuperAdminRole {
		out, e := a.Partners.UpdateRatio(r.Context(), r.PathValue("id"), v.Data.ChildMarginBps, v.Version, identity(r).ID, identity(r).PartnerID)
		partnerResult(w, out, e)
		return
	}
	out, e := a.Partners.Update(r.Context(), r.PathValue("id"), v.Data, v.Version, identity(r).ID)
	partnerResult(w, out, e)
}
func (a *Server) partnerPolicy(w http.ResponseWriter, r *http.Request) {
	if !platformOnly(w, r) {
		return
	}
	row, v, e := a.Partners.Policy(r.Context())
	row.Data = core.Data(v)
	partnerResult(w, row, e)
}
func (a *Server) savePartnerPolicy(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64                   `json:"version"`
		Data    core.DistributionPolicy `json:"data"`
	}
	if !platformOnly(w, r) || !decode(w, r, &v) {
		return
	}
	out, e := a.Partners.SavePolicy(r.Context(), v.Data, v.Version, identity(r).ID)
	partnerResult(w, out, e)
}
