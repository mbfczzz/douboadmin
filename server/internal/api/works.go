package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"time"
)

func (a *Server) works(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Has("page") {
		a.pagedJobs(w, r, true)
		return
	}
	owner := identity(r).ID
	if identity(r).Role == "admin" {
		owner = ""
	}
	jobs, e := a.Store.Jobs(r.Context(), owner)
	if e != nil {
		dbError(w, e)
		return
	}
	out := []core.Job{}
	for _, j := range jobs {
		if j.Status != "succeeded" || !core.IsWork(j.Input.Kind) {
			continue
		}
		a.presentJob(r.Context(), &j)
		if j.Deleted && identity(r).Role != "admin" {
			continue
		}
		out = append(out, j)
	}
	reply(w, 200, out)
}
func (a *Server) deleteWork(w http.ResponseWriter, r *http.Request) {
	j, e := a.Store.Job(r.Context(), r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	if j.UserID != identity(r).ID && identity(r).Role != "admin" {
		fail(w, 404, "作品不存在")
		return
	}
	if j.Status != "succeeded" || !core.IsWork(j.Input.Kind) {
		fail(w, 409, "当前任务不是可删除的作品")
		return
	}
	e = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		row, e := tx.Lock("work_meta", core.Record{ID: j.ID, Owner: j.UserID, Data: core.Data(core.WorkMeta{})})
		if e != nil {
			return e
		}
		var meta core.WorkMeta
		if e = json.Unmarshal(row.Data, &meta); e != nil {
			return e
		}
		if meta.Deleted {
			return nil
		}
		now := time.Now().UTC()
		meta.Deleted = true
		meta.DeletedAt = &now
		row.Data = core.Data(meta)
		_, e = tx.Put("work_meta", row, row.Version)
		return e
	})
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}
