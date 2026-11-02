package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"errors"
	"net/http"
	"strconv"
)

func partnerError(w http.ResponseWriter, e error) {
	var rule *partners.RuleError
	switch {
	case errors.As(e, &rule):
		fail(w, 400, e.Error())
	case errors.Is(e, core.ErrQuota):
		fail(w, 409, e.Error())
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
		rows, e := a.Store.RecordPage(r.Context(), core.RecordQuery{Namespace: ns, Owner: q.Get("owner"), PartnerID: q.Get("provider"), Search: q.Get("q"), Status: q.Get("status"), Page: page, Size: 20})
		partnerResult(w, rows, e)
	}
}
func (a *Server) partnerOverview(w http.ResponseWriter, r *http.Request) {
	out, e := a.Partners.Overview(r.Context(), r.PathValue("id"))
	partnerResult(w, out, e)
}
func (a *Server) createPartner(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Name     string `json:"name"`
		ParentID string `json:"parentId"`
	}
	if !decode(w, r, &v) {
		return
	}
	out, e := a.Partners.Create(r.Context(), v.ParentID, v.Name, r.Header.Get("Idempotency-Key"), identity(r).ID)
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
	out, e := a.Partners.Update(r.Context(), r.PathValue("id"), v.Data, v.Version, identity(r).ID)
	partnerResult(w, out, e)
}
func (a *Server) partnerPolicy(w http.ResponseWriter, r *http.Request) {
	row, v, e := a.Partners.Policy(r.Context())
	row.Data = core.Data(v)
	partnerResult(w, row, e)
}
func (a *Server) savePartnerPolicy(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64                   `json:"version"`
		Data    core.DistributionPolicy `json:"data"`
	}
	if !decode(w, r, &v) {
		return
	}
	out, e := a.Partners.SavePolicy(r.Context(), v.Data, v.Version, identity(r).ID)
	partnerResult(w, out, e)
}
