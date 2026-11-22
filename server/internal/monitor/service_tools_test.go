package monitor

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"testing"
)

func TestHeartbeatIncludesLocalToolChecks(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	s := store.NewMemory()
	m := New(s, "worker", "")
	if m.Snapshot().MediaTools != nil {
		t.Fatal("unchecked tools reported as available")
	}
	m.beat(t.Context())
	row, err := s.Get(t.Context(), "instances", m.ID)
	var node core.NodeHealth
	if err != nil || json.Unmarshal(row.Data, &node) != nil || node.MediaTools == nil {
		t.Fatal("worker tool status not persisted in heartbeat", err)
	}
	if node.Role != "worker" || node.MediaTools.FFmpeg.Status != "missing" || node.MediaTools.FFprobe.Status != "missing" || node.MediaTools.CheckedAt.IsZero() {
		t.Fatal(node)
	}
}
