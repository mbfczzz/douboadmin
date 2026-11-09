package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (a *Server) auditRoutes() {
	m := a.Mux
	m.HandleFunc("GET /api/admin/audit", a.auth("admin", a.auditList))
	m.HandleFunc("GET /api/admin/audit/points", a.auth("admin", a.auditPoints))
	m.HandleFunc("GET /api/admin/audit/stats", a.auth("admin", a.auditStats))
	m.HandleFunc("GET /api/admin/audit/{id}", a.auth("admin", a.auditDetail))
}

func (a *Server) auditStore(w http.ResponseWriter) store.AuditLogs {
	logs, ok := a.Store.(store.AuditLogs)
	if !ok {
		fail(w, 503, "当前存储不支持日志")
	}
	return logs
}

// tabs map to log categories: 接口日志 shows every HTTP request.
var auditTabs = map[string][]string{
	"business": {core.LogBusiness},
	"auth":     {core.LogAuth},
	"model":    {core.LogModel},
	"api":      {core.LogAPI, core.LogBusiness, core.LogAuth},
}

func day(s string, add int) (time.Time, bool) {
	t, err := time.ParseInLocation("2006-01-02", s, reportZone)
	return t.AddDate(0, 0, add), err == nil
}

func (a *Server) auditList(w http.ResponseWriter, r *http.Request) {
	logs := a.auditStore(w)
	if logs == nil {
		return
	}
	v := r.URL.Query()
	q := core.AuditQuery{
		Categories: auditTabs[v.Get("tab")], Actor: strings.TrimSpace(v.Get("actor")),
		Target: strings.TrimSpace(v.Get("target")), Search: strings.TrimSpace(v.Get("q")),
		Method: v.Get("method"), WritesOnly: v.Get("writes") == "1", Before: v.Get("before"),
	}
	if q.Categories == nil {
		q.Categories = auditTabs["business"]
	}
	if s := v.Get("status"); s == "ok" || s == "fail" {
		failed := s == "fail"
		q.Failed = &failed
	}
	if s := v.Get("from"); s != "" {
		if t, ok := day(s, 0); ok {
			q.From = t
		}
	}
	if s := v.Get("to"); s != "" {
		if t, ok := day(s, 1); ok {
			q.To = t
		}
	}
	if len([]rune(q.Actor)) > 64 || len([]rune(q.Target)) > 64 || len([]rune(q.Search)) > 100 || len(q.Before) > 26 {
		fail(w, 400, "查询条件过长")
		return
	}
	page, err := logs.Logs(r.Context(), q)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, page)
}

func (a *Server) auditDetail(w http.ResponseWriter, r *http.Request) {
	logs := a.auditStore(w)
	if logs == nil {
		return
	}
	e, err := logs.Log(r.Context(), r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, e)
}

// auditPoints lists points movements from the wallet ledger itself (the
// source of truth), with the user's and the operator's names resolved.
func (a *Server) auditPoints(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	page, _ := strconv.Atoi(v.Get("page"))
	if page < 1 {
		page = 1
	}
	out, err := a.Store.RecordPage(r.Context(), core.RecordQuery{Namespace: "wallet_ledger", Owner: strings.TrimSpace(v.Get("user")), Search: strings.TrimSpace(v.Get("q")), Page: page, Size: 30})
	if err != nil {
		dbError(w, err)
		return
	}
	type row struct {
		core.Record
		UserName  string `json:"userName"`
		ActorName string `json:"actorName"`
	}
	items := make([]row, 0, len(out.Items))
	for _, rec := range out.Items {
		var entry core.LedgerEntry
		_ = json.Unmarshal(rec.Data, &entry)
		it := row{Record: rec}
		if a.Audit != nil {
			it.UserName = a.Audit.Name(r.Context(), "user", rec.Owner)
			if entry.Actor != "" {
				it.ActorName = a.Audit.Name(r.Context(), "admin", entry.Actor)
			}
		}
		items = append(items, it)
	}
	reply(w, 200, map[string]any{"items": items, "page": out.Page, "size": out.Size, "total": out.Total})
}

// auditStats feeds the overview: request volume, errors and latency, cached
// briefly so dashboard refreshes never pile up aggregate queries.
func (a *Server) auditStats(w http.ResponseWriter, r *http.Request) {
	if a.auditStore(w) == nil {
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days != 1 && days != 7 && days != 30 && days != 90 {
		days = 1
	}
	stats, err := a.apiStats(r.Context(), days)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, map[string]any{"stats": stats, "dropped": a.Audit.Dropped()})
}

// apiStats covers the same Beijing-time days as the dashboard (cached 1 min).
func (a *Server) apiStats(ctx context.Context, days int) (*core.APIStats, error) {
	logs, ok := a.Store.(store.AuditLogs)
	if !ok {
		return nil, core.ErrNotFound
	}
	now := time.Now().In(reportZone)
	since := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, reportZone).AddDate(0, 0, 1-days)
	stats, err := a.statsCache.get(days, func() (core.APIStats, error) { return logs.LogStats(ctx, since) })
	return &stats, err
}
