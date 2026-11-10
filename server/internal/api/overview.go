package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
)

func (a *Server) overview(w http.ResponseWriter, r *http.Request) {
	j, e := a.Store.Jobs(r.Context(), "")
	if e != nil {
		dbError(w, e)
		return
	}
	u, e := a.Store.UserPage(r.Context(), core.UserQuery{Page: 1, Size: 1})
	if e != nil {
		dbError(w, e)
		return
	}
	t, e := a.Store.List(r.Context(), "templates", "")
	if e != nil {
		dbError(w, e)
		return
	}
	active := 0
	for _, row := range t {
		var item core.Template
		if json.Unmarshal(row.Data, &item) == nil && !item.Deleted {
			active++
		}
	}
	states := map[string]int{"queued": 0, "running": 0, "succeeded": 0, "failed": 0}
	for _, v := range j {
		states[v.Status]++
	}
	reply(w, 200, map[string]any{"users": u.Total, "templates": active, "tasks": len(j), "states": states, "demo": false, "relayConfigured": a.Relay.Ready(), "storage": a.Config.Storage, "clusterReady": a.Config.Storage == "mysql" && a.Sessions.Redis != nil && a.Objects != nil, "scope": "最近 200 个任务 / 最多 500 个模板"})
}
