package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"time"
)

// Per-user records for the 小程序用户 page (users menu, platform accounts
// only): which models the user generated with, and what the user did.

type modelUse struct {
	Model       string    `json:"model"`
	Name        string    `json:"name"`
	Kind        string    `json:"kind"`
	Calls       int       `json:"calls"`
	Succeeded   int       `json:"succeeded"`
	Failed      int       `json:"failed"`
	Active      int       `json:"active"`
	PointsUnits int64     `json:"pointsUnits"`
	LastAt      time.Time `json:"lastAt"`
}

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

// userModels summarises the user's latest (up to 200) generation tasks per
// model, plus the latest 100 tasks. Points count only what was actually
// charged; reserved and refunded points are shown per task, not summed.
// Material imports are not model calls and are skipped.
func (a *Server) userModels(w http.ResponseWriter, r *http.Request) {
	jobs, e := a.Store.Jobs(r.Context(), r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	bills := map[string]core.JobBilling{}
	if rows, e := a.Store.List(r.Context(), "job_billing", r.PathValue("id")); e == nil {
		for _, row := range rows {
			var b core.JobBilling
			if json.Unmarshal(row.Data, &b) == nil {
				bills[row.ID] = b
			}
		}
	}
	names := map[string]string{}
	if rows, e := a.Store.List(r.Context(), "models", ""); e == nil {
		for _, row := range rows {
			var m core.Model
			if json.Unmarshal(row.Data, &m) == nil {
				names[row.ID] = m.Name
			}
		}
	}
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].CreatedAt.After(jobs[j].CreatedAt) })
	uses, recent := map[string]*modelUse{}, []modelJob{}
	for _, j := range jobs {
		if j.Input.Kind == "import" {
			continue
		}
		name := names[j.Input.Model]
		if name == "" {
			name = j.ModelName
		}
		u := uses[j.Input.Model]
		if u == nil {
			u = &modelUse{Model: j.Input.Model, Name: name, Kind: j.Input.Kind, LastAt: j.CreatedAt}
			uses[j.Input.Model] = u
		}
		u.Calls++
		bill := bills[j.ID]
		if bill.State == "charged" {
			u.PointsUnits += bill.Units
		}
		switch j.Status {
		case "succeeded":
			u.Succeeded++
		case "failed", "canceled":
			u.Failed++
		default:
			u.Active++
		}
		if len(recent) < 100 {
			recent = append(recent, modelJob{j.ID, j.Input.Model, name, j.Input.Kind, j.Status, bill.Units, bill.State, short(j.Input.Prompt, 80), j.Error, j.CreatedAt, j.UpdatedAt})
		}
	}
	models := make([]*modelUse, 0, len(uses))
	for _, u := range uses {
		models = append(models, u)
	}
	sort.Slice(models, func(i, j int) bool {
		if models[i].Calls != models[j].Calls {
			return models[i].Calls > models[j].Calls
		}
		return models[i].Model < models[j].Model
	})
	reply(w, 200, map[string]any{"models": models, "jobs": recent, "limited": len(jobs) >= 200})
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
