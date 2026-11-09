package monitor

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"testing"
	"time"
)

func TestRepeatedLogsFoldIntoOneRowPerHour(t *testing.T) {
	ctx, s := context.Background(), store.NewMemory()
	entry := core.ErrorLog{Level: "WARN", Message: "reconciliation pending", Detail: "id=order-1", Node: "n1"}
	at := time.Date(2026, 11, 9, 1, 5, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		saveLog(ctx, s, entry, at.Add(time.Duration(i)*time.Minute))
	}
	other := entry
	other.Detail = "id=order-2"
	saveLog(ctx, s, other, at)
	saveLog(ctx, s, entry, at.Add(time.Hour))
	rows, _ := s.List(ctx, "error_logs", "")
	if len(rows) != 3 {
		t.Fatal("rows", len(rows))
	}
	counts := map[int]int{}
	for _, row := range rows {
		var v core.ErrorLog
		_ = json.Unmarshal(row.Data, &v)
		counts[v.Count]++
		if v.Count == 3 && !v.LastAt.Equal(at.Add(2*time.Minute)) {
			t.Fatal("last seen not updated", v.LastAt)
		}
	}
	if counts[3] != 1 || counts[1] != 2 {
		t.Fatal("folding", counts)
	}
}
