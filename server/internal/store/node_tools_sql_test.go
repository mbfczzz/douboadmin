package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
	"time"
)

func TestMySQLNodeToolReportRoundTrip(t *testing.T) {
	m := mysqlFixture(t)
	now := time.Now().UTC().Truncate(time.Microsecond)
	id := core.NewID()
	node := core.NodeHealth{ID: id, Host: "tool-test-node", Role: "worker", SeenAt: now, MediaTools: &core.MediaTools{
		CheckedAt: now, FFmpeg: core.ToolCheck{Status: "ready", Version: "7.1.1", Path: "/usr/bin/ffmpeg"},
		FFprobe: core.ToolCheck{Status: "missing", Error: "未找到"},
	}}
	if _, err := m.Put(t.Context(), "instances", core.Record{ID: id, Data: core.Data(node)}, 0); err != nil {
		t.Fatal(err)
	}
	row, err := m.Get(t.Context(), "instances", id)
	var actual core.NodeHealth
	if err != nil || json.Unmarshal(row.Data, &actual) != nil || actual.MediaTools == nil || *actual.MediaTools != *node.MediaTools {
		t.Fatal("node tool report lost in SQL metadata", err)
	}
}
