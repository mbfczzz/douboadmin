package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
)

func (a *Server) notifications(w http.ResponseWriter, r *http.Request) {
	q, ok := listQuery(w, r, "notifications")
	if !ok {
		return
	}
	q.Owner = identity(r).ID
	page, e := a.Store.RecordPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	q.Page, q.Size = 1, 1
	q.Fields["read"] = "false"
	unread, e := a.Store.RecordPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]any{"items": page.Items, "page": page.Page, "size": page.Size, "total": page.Total, "unread": unread.Total})
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
	q := core.RecordQuery{Namespace: "notifications", Owner: identity(r).ID, Page: 1, Size: 100, ByID: true, Fields: map[string]string{"read": "false"}}
	for {
		page, e := a.Store.RecordPage(r.Context(), q)
		if e != nil {
			dbError(w, e)
			return
		}
		for _, row := range page.Items {
			var n core.Notification
			if json.Unmarshal(row.Data, &n) != nil || n.Read {
				continue
			}
			n.Read = true
			row.Data = core.Data(n)
			if _, e = a.Store.Put(r.Context(), "notifications", row, row.Version); e != nil {
				dbError(w, e)
				return
			}
		}
		if len(page.Items) < q.Size {
			break
		}
		q.AfterID = page.Items[len(page.Items)-1].ID
	}
	reply(w, 200, map[string]bool{"ok": true})
}
