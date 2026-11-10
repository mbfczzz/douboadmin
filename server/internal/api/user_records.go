package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// Per-user records for the 小程序用户 page (users menu, platform accounts
// only): which models the user generated with, and what the user did.

type modelUse = core.JobModelUse

type modelJob struct {
	ID          string    `json:"id"`
	Model       string    `json:"model"`
	Name        string    `json:"name"`
	Kind        string    `json:"kind"`
	Status      string    `json:"status"`
	PointsUnits int64     `json:"pointsUnits"`
	Billing     string    `json:"billing,omitempty"` // reserved, charged, released
	Prompt      string    `json:"prompt"`
	Error       string    `json:"error,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// userModels returns complete model aggregates and one bounded page of jobs.
func (a *Server) userModels(w http.ResponseWriter, r *http.Request) {
	q, ok := jobQuery(w, r)
	if !ok {
		return
	}
	q.User = r.PathValue("id")
	q.ExcludeImport = true
	page, e := a.Store.JobPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	models, e := a.Store.JobModels(r.Context(), q.User)
	if e != nil {
		dbError(w, e)
		return
	}
	names := map[string]string{}
	for i := range models {
		row, err := a.Store.Get(r.Context(), "models", models[i].Model)
		if err == nil {
			var m core.Model
			_ = json.Unmarshal(row.Data, &m)
			models[i].Name = m.Name
			names[models[i].Model] = m.Name
		}
	}
	recent := []modelJob{}
	for _, j := range page.Items {
		var bill core.JobBilling
		if row, err := a.Store.Get(r.Context(), "job_billing", j.ID); err == nil {
			_ = json.Unmarshal(row.Data, &bill)
		}
		recent = append(recent, modelJob{j.ID, j.Input.Model, names[j.Input.Model], j.Input.Kind, j.Status, bill.Units, bill.State, short(j.Input.Prompt, 80), j.Error, j.CreatedAt, j.UpdatedAt})
	}
	reply(w, 200, map[string]any{"models": models, "jobs": recent, "limited": false, "page": page.Page, "size": page.Size, "total": page.Total})
}

// userActivity pages through the operation log entries made by this user:
// scope=ops is business actions and sign-ins, scope=all adds every API call
// and the model calls made for the user's tasks.
func (a *Server) userActivity(w http.ResponseWriter, r *http.Request) {
	logs := a.auditStore(w)
	if logs == nil {
		return
	}
	v := r.URL.Query()
	q := core.AuditQuery{Categories: []string{core.LogBusiness, core.LogAuth}, ActorID: r.PathValue("id"), Before: v.Get("before")}
	if v.Get("scope") == "all" {
		q.Categories = append(q.Categories, core.LogAPI, core.LogModel)
	}
	q.Limit, _ = strconv.Atoi(v.Get("limit"))
	if len(q.Before) > 26 {
		fail(w, 400, "查询条件过长")
		return
	}
	page, e := logs.Logs(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, page)
}

// userActivityEntry opens one of the user's own log entries in full.
func (a *Server) userActivityEntry(w http.ResponseWriter, r *http.Request) {
	logs := a.auditStore(w)
	if logs == nil {
		return
	}
	e, err := logs.Log(r.Context(), r.PathValue("log"))
	if err == nil && e.ActorID != r.PathValue("id") {
		err = core.ErrNotFound
	}
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, e)
}
