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
	case errors.Is(e, partners.ErrReviewDenied):
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
	partnerResult(w, out, e)
}
func (a *Server) createPartner(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Name     string                `json:"name"`
		ParentID string                `json:"parentId"`
		Role     string                `json:"role"`
		Account  *providerAccountInput `json:"account"`
	}
	// The platform can add branches by hand. All S1/S2 providers must enter
	// through scan registration, even when the caller is a platform admin.
	if !decode(w, r, &v) || !platformOnly(w, r) {
		return
	}
	if v.ParentID != core.RootPartner || v.Role != core.RoleBranch {
		fail(w, 400, "下级服务商只能通过扫码登记新增")
		return
	}
	hash, key, actor := "", r.Header.Get("Idempotency-Key"), identity(r).ID
	if v.Account != nil {
		// A retried request whose provider and login were both created is a success.
		if done, replayed, e := a.Partners.Replay(r.Context(), actor, key); e != nil {
			dbError(w, e)
			return
		} else if replayed {
			if _, _, exists, e := a.providerAccount(r.Context(), done.ID); e != nil || exists {
				partnerResult(w, done, e)
				return
			}
		}
		var e error
		if hash, e = a.prepareProviderAccount(r, *v.Account); e != nil {
			fail(w, 400, e.Error())
			return
		}
	}
	out, e := a.Partners.Create(r.Context(), v.ParentID, v.Name, v.Role, key, actor)
	if e != nil {
		partnerError(w, e)
		return
	}
	if v.Account != nil {
		if _, e = a.createProviderAccount(r.Context(), out.ID, v.Name, hash, *v.Account, actor); e != nil {
			fail(w, 409, "服务商已创建，但登录账号创建失败，请在服务商编辑中重新设置账号")
			return
		}
	}
	reply(w, 200, out)
}
func (a *Server) updatePartner(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64        `json:"version"`
		Data    core.Partner `json:"data"`
	}
	if !decode(w, r, &v) {
		return
	}
	if !a.belowPartner(w, r, r.PathValue("id")) || !a.withinOwnPricing(w, r, r.PathValue("id"), v.Data) {
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
