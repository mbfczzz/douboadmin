package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (a *Server) reviews(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "reviews", "")
	if e != nil {
		dbError(w, e)
		return
	}
	out := []map[string]any{}
	seen := map[string]bool{}
	for _, row := range rows {
		seen[row.ID] = true
		j, e := a.Store.Job(r.Context(), row.ID)
		if e != nil {
			continue
		}
		a.presentJob(r.Context(), &j)
		if j.Deleted {
			continue
		}
		out = append(out, map[string]any{"record": row, "job": j})
	}
	jobs, e := a.Store.Jobs(r.Context(), "")
	if e != nil {
		dbError(w, e)
		return
	}
	for _, j := range jobs {
		if seen[j.ID] || j.Status != "succeeded" || !core.IsWork(j.Input.Kind) {
			continue
		}
		a.presentJob(r.Context(), &j)
		if j.Deleted {
			continue
		}
		row := core.Record{ID: j.ID, Owner: j.UserID, CreatedAt: j.CreatedAt, Data: core.Data(core.Review{JobID: j.ID, Kind: j.Input.Kind, Status: "pending"})}
		out = append(out, map[string]any{"record": row, "job": j})
	}
	reply(w, 200, out)
}
func (a *Server) reviewWork(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64  `json:"version"`
		Status  string `json:"status"`
		Reason  string `json:"reason"`
	}
	if !decode(w, r, &v) {
		return
	}
	v.Reason = strings.TrimSpace(v.Reason)
	if (v.Status != "approved" && v.Status != "rejected") || len([]rune(v.Reason)) > 300 || (v.Status == "rejected" && v.Reason == "") {
		fail(w, 400, "请选择审核结果；驳回时请填写原因")
		return
	}
	id := r.PathValue("id")
	j, e := a.Store.Job(r.Context(), id)
	if e != nil {
		dbError(w, e)
		return
	}
	a.presentJob(r.Context(), &j)
	if j.Status != "succeeded" || j.Deleted || !core.IsWork(j.Input.Kind) {
		fail(w, 409, "作品当前不可审核")
		return
	}
	e = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		row, e := tx.Get("reviews", id)
		if errors.Is(e, core.ErrNotFound) {
			row = core.Record{ID: id, Owner: j.UserID, Data: core.Data(core.Review{JobID: id, Kind: j.Input.Kind, Status: "pending"})}
			e = nil
		}
		if e != nil {
			return e
		}
		var review core.Review
		if e = json.Unmarshal(row.Data, &review); e != nil {
			return e
		}
		now := time.Now().UTC()
		review.Status = v.Status
		review.Reason = v.Reason
		review.Reviewer = identity(r).ID
		review.ReviewedAt = &now
		row.Data = core.Data(review)
		updated, e := tx.Put("reviews", row, v.Version)
		if e != nil {
			return e
		}
		_, e = tx.Put("review_audit", core.Record{ID: core.NewID(), Owner: j.UserID, Data: core.Data(review)}, 0)
		if e != nil {
			return e
		}
		title, content := "作品审核已通过", "现在可以分享这份作品。"
		if v.Status == "rejected" {
			title = "作品审核未通过"
			content = v.Reason
		}
		return store.NotifyOnce(tx, j.UserID, "review:"+id+":"+strconv.FormatInt(updated.Version, 10), core.Notification{Kind: "review", Title: title, Content: content, TargetID: id})
	})
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}
