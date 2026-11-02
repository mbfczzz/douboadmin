package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
)

func (a *Server) notifications(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "notifications", identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	count := 0
	for _, row := range rows {
		var n core.Notification
		if json.Unmarshal(row.Data, &n) == nil && !n.Read {
			count++
		}
	}
	reply(w, 200, map[string]any{"items": rows, "unread": count})
}
func (a *Server) readNotification(w http.ResponseWriter, r *http.Request) {
	user := identity(r).ID
	row, e := a.Store.Get(r.Context(), "notifications", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	if row.Owner != user {
		fail(w, 404, "通知不存在")
		return
	}
	var n core.Notification
	if e = json.Unmarshal(row.Data, &n); e != nil {
		dbError(w, e)
		return
	}
	if n.Read {
		reply(w, 200, row)
		return
	}
	n.Read = true
	row.Data = core.Data(n)
	row, e = a.Store.Put(r.Context(), "notifications", row, row.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
func (a *Server) readAllNotifications(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "notifications", identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	for _, row := range rows {
		var n core.Notification
		if json.Unmarshal(row.Data, &n) != nil || n.Read {
			continue
		}
		n.Read = true
		row.Data = core.Data(n)
		if _, e = a.Store.Put(r.Context(), "notifications", row, row.Version); e != nil && e != core.ErrConflict {
			dbError(w, e)
			return
		}
	}
	reply(w, 200, map[string]bool{"ok": true})
}
