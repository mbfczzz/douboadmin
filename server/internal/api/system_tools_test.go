package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
	"time"
)

func TestSystemToolsDetectsCurrentAPIAndRetainsIndependentWorkerResults(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	a, admin, user := integrationAdmin(t)
	for id, ago := range map[string]time.Duration{"remote-worker": 0, "offline-worker": 2 * time.Minute, a.Runtime.ID: time.Hour} {
		node := core.NodeHealth{ID: id, Host: id + "-host", Role: "worker", SeenAt: time.Now().Add(-ago), MediaTools: &core.MediaTools{FFmpeg: core.ToolCheck{Status: "ready", Version: "7.1.1"}, FFprobe: core.ToolCheck{Status: "ready", Version: "7.1.1"}, CheckedAt: time.Now()}}
		if _, err := a.Store.Put(t.Context(), "instances", core.Record{ID: id, Data: core.Data(node)}, 0); err != nil {
			t.Fatal(err)
		}
	}
	if w := call(a, "GET", "/api/admin/system-tools", user, "", nil); w.Code != 403 {
		t.Fatal("user may run system tool checks", w.Code)
	}
	w := call(a, "GET", "/api/admin/system-tools", admin, "", nil)
	var out struct {
		CurrentID string        `json:"currentId"`
		Nodes     []core.Record `json:"nodes"`
	}
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" || json.Unmarshal(w.Body.Bytes(), &out) != nil || len(out.Nodes) != 3 || out.CurrentID != a.Runtime.ID {
		t.Fatal(w.Code, w.Body.String())
	}
	var local, remote core.NodeHealth
	_ = json.Unmarshal(out.Nodes[0].Data, &local)
	_ = json.Unmarshal(out.Nodes[1].Data, &remote)
	if local.Role != "serve" || local.MediaTools.FFmpeg.Status != "missing" || local.MediaTools.FFprobe.Status != "missing" || remote.ID != "remote-worker" || remote.MediaTools.FFmpeg.Status != "ready" {
		t.Fatal("API result overwrote remote tool status or retained its own stale heartbeat")
	}
	if w := call(a, "GET", "/api/config", user, "", nil); json.Valid(w.Body.Bytes()) && containsToolPaths(w.Body.Bytes()) {
		t.Fatal("tool diagnostics exposed in public config")
	}
}

func containsToolPaths(body []byte) bool {
	var data map[string]json.RawMessage
	_ = json.Unmarshal(body, &data)
	return data["mediaTools"] != nil || data["nodes"] != nil
}
