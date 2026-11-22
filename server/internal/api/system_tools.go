package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"sort"
)

func (a *Server) systemTools(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if a.Runtime == nil || a.Runtime.Tools == nil {
		fail(w, 503, "系统工具检测尚未初始化")
		return
	}
	if _, err := a.Runtime.Tools.Check(r.Context(), true); err != nil {
		fail(w, 503, "系统工具检测已取消，请重新检测")
		return
	}
	nodes, err := store.AllRecords(r.Context(), a.Store, "instances", "")
	if err != nil {
		dbError(w, err)
		return
	}
	// The current API is tested synchronously, even before its first heartbeat.
	current := a.Runtime.Snapshot()
	out := []core.Record{{ID: current.ID, Data: core.Data(current)}}
	for _, row := range nodes {
		if row.ID != current.ID {
			out = append(out, row)
		}
	}
	sort.SliceStable(out[1:], func(i, j int) bool {
		var a, b core.NodeHealth
		_ = json.Unmarshal(out[i+1].Data, &a)
		_ = json.Unmarshal(out[j+1].Data, &b)
		return a.SeenAt.After(b.SeenAt)
	})
	reply(w, 200, map[string]any{"currentId": current.ID, "nodes": out})
}
