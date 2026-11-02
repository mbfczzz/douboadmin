package api

import (
	"doubo/server/internal/provider"
	"encoding/json"
	"net/http"
	"strings"
)

func (a *Server) execution(w http.ResponseWriter, r *http.Request) {
	row, err := a.Store.Get(r.Context(), "executions", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	var e provider.Execution
	if json.Unmarshal(row.Data, &e) != nil {
		fail(w, 500, "执行记录无效")
		return
	}
	// Result URLs may be transient signed URLs. Return only operational metadata.
	reply(w, 200, map[string]any{"phase": e.Phase, "taskId": e.TaskID, "modelKey": e.ModelKey, "startedAt": e.StartedAt})
}

func (a *Server) releaseJob(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Verified bool   `json:"verified"`
		Reason   string `json:"reason"`
	}
	if !decode(w, r, &v) {
		return
	}
	v.Reason = strings.TrimSpace(v.Reason)
	if !v.Verified || len([]rune(v.Reason)) < 5 || len([]rune(v.Reason)) > 200 {
		fail(w, 400, "请核实上游任务结果并填写处理原因")
		return
	}
	if e := a.Billing.ReleaseJob(r.Context(), r.PathValue("id"), identity(r).ID, v.Reason); e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}

func (a *Server) resumeJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, err := a.Store.Get(r.Context(), "executions", id)
	if err != nil {
		dbError(w, err)
		return
	}
	var e provider.Execution
	if json.Unmarshal(row.Data, &e) != nil {
		fail(w, 500, "执行记录无效")
		return
	}
	if e.Phase != "polling" && e.Phase != "output" && e.Phase != "succeeded" {
		fail(w, 409, "没有可安全恢复的上游任务，请先在中转站核实提交情况")
		return
	}
	job, err := a.Store.Job(r.Context(), id)
	if err != nil {
		dbError(w, err)
		return
	}
	if job.Status != "failed" {
		fail(w, 409, "此任务正在处理或已经完成")
		return
	}
	if err = a.Store.Resume(r.Context(), id); err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}
