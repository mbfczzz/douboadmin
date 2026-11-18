package api

import (
	"doubo/server/internal/core"
	"errors"
	"net/http"
)

func (a *Server) jobs(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Has("page") {
		a.pagedJobs(w, r, false)
		return
	}
	id := identity(r)
	user := id.ID
	if id.Role == "admin" {
		user = ""
	}
	rows, e := a.Store.Jobs(r.Context(), user)
	if e != nil {
		dbError(w, e)
		return
	}
	for i := range rows {
		a.presentJob(r.Context(), &rows[i])
	}
	reply(w, 200, rows)
}

func (a *Server) job(w http.ResponseWriter, r *http.Request) {
	j, e := a.Store.Job(r.Context(), r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	if j.UserID != identity(r).ID {
		fail(w, 404, "任务不存在")
		return
	}
	a.presentJob(r.Context(), &j)
	reply(w, 200, j)
}

func (a *Server) submit(w http.ResponseWriter, r *http.Request, in core.JobInput) {
	key := r.Header.Get("Idempotency-Key")
	if len(key) < 8 || len(key) > 128 {
		fail(w, 400, "请提供有效的 Idempotency-Key")
		return
	}
	user := identity(r).ID
	j := core.NewJob(user, key, in)
	j.ActivationRequired = a.Config.RequireActivation && identity(r).Role == "user"
	if old, e := a.Store.Job(r.Context(), j.ID); e == nil {
		if old.Hash != j.Hash {
			dbError(w, core.ErrIdempotency)
			return
		}
		a.presentJob(r.Context(), &old)
		reply(w, 200, old)
		return
	} else if !errors.Is(e, core.ErrNotFound) {
		dbError(w, e)
		return
	}
	if e := a.validateJob(r.Context(), user, &in); e != nil {
		fail(w, 400, e.Error())
		return
	}
	units, cost, billed, e := a.priceInput(r, in)
	if e != nil {
		dbError(w, e)
		return
	}
	j.EstimatedCostMicros = cost
	j.Input = in
	if billed && identity(r).Role == "user" {
		if units > 0 && in.ExpectedCostUnits == nil {
			fail(w, 409, "请先确认本次创作消耗的积分后再提交")
			return
		}
		if units > 0 && units > *in.ExpectedCostUnits {
			fail(w, 409, "积分价格已更新，请确认后重新提交")
			return
		}
		j.CostUnits = units
	}
	j, e = a.Store.CreateJob(r.Context(), j)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 202, j)
}

func (a *Server) createJob(w http.ResponseWriter, r *http.Request) {
	var in core.JobInput
	if !decode(w, r, &in) {
		return
	}
	a.submit(w, r, in)
}

func (a *Server) retry(w http.ResponseWriter, r *http.Request) {
	j, e := a.Store.Job(r.Context(), r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	if j.UserID != identity(r).ID {
		fail(w, 404, "任务不存在")
		return
	}
	a.presentJob(r.Context(), &j)
	if j.Status != "failed" {
		fail(w, 409, "只有失败任务可以重试")
		return
	}
	if !j.Retryable {
		fail(w, 409, "当前任务需核实上游状态，请联系管理员恢复查询")
		return
	}
	in := j.Input
	var approval struct {
		ExpectedCostUnits *int64 `json:"expectedCostUnits"`
	}
	if !decode(w, r, &approval) {
		return
	}
	if approval.ExpectedCostUnits != nil {
		in.ExpectedCostUnits = approval.ExpectedCostUnits
	}
	in.ParentID = j.ID
	a.submit(w, r, in)
}
