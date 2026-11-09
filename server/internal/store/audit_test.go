package store

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
	"testing"
	"time"
)

// The same behaviour is required from both drivers (MySQL runs when
// MYSQL_TEST_DSN points at a _test database).
func TestAuditLogsQueryPruneAndStats(t *testing.T) {
	drivers := map[string]func(*testing.T) AuditLogs{
		"memory": func(*testing.T) AuditLogs { return NewMemory() },
		"mysql":  func(t *testing.T) AuditLogs { return mysqlFixture(t) },
	}
	for name, open := range drivers {
		t.Run(name, func(t *testing.T) {
			logs, ctx := open(t), context.Background()
			base := time.Now().Add(-time.Hour).Truncate(time.Millisecond)
			tag := fmt.Sprint(base.UnixNano())
			var entries []core.AuditEntry
			for i := range 5 {
				at := base.Add(time.Duration(i) * time.Second)
				e := core.AuditEntry{ID: fmt.Sprintf("%013x%s%02d", at.UnixMilli(), tag[len(tag)-11:], i), At: at, Category: core.LogBusiness, Action: "调整用户积分", ActorType: "admin", ActorID: "admin-" + tag, ActorName: "运营小王", TargetID: "user-" + tag, Method: "POST", Status: 200, DurationMs: 10 * (i + 1), Request: `{"units":100}`, Response: `{"ok":true}`}
				if i == 4 {
					e.Category, e.Method, e.Status, e.Action, e.DurationMs = core.LogAPI, "GET", 500, "", 1500
				}
				entries = append(entries, e)
			}
			if err := logs.AppendLogs(ctx, entries); err != nil {
				t.Fatal(err)
			}
			page, err := logs.Logs(ctx, core.AuditQuery{Categories: []string{core.LogBusiness}, Actor: "小王", Limit: 2})
			if err != nil || len(page.Items) != 2 || page.Items[0].ID != entries[3].ID || page.Next != entries[2].ID || page.Items[0].Request != "" {
				t.Fatalf("first page %+v %v", page, err)
			}
			page, _ = logs.Logs(ctx, core.AuditQuery{Categories: []string{core.LogBusiness}, Actor: "admin-" + tag, Before: page.Next, Limit: 2})
			if len(page.Items) != 2 || page.Items[0].ID != entries[1].ID {
				t.Fatalf("second page %+v", page)
			}
			failed := true
			page, _ = logs.Logs(ctx, core.AuditQuery{Target: "user-" + tag, Failed: &failed})
			if len(page.Items) != 1 || page.Items[0].Status != 500 {
				t.Fatalf("failed filter %+v", page)
			}
			full, err := logs.Log(ctx, entries[0].ID)
			if err != nil || full.Request != `{"units":100}` || full.ActorName != "运营小王" {
				t.Fatalf("detail %+v %v", full, err)
			}
			stats, err := logs.LogStats(ctx, base.Add(-time.Second))
			if err != nil || stats.Requests < 5 || stats.Errors < 1 || stats.Slow < 1 {
				t.Fatalf("stats %+v %v", stats, err)
			}
			// Reads expire long before writes.
			if _, err := logs.PruneLogs(ctx, base.Add(-time.Hour), base.Add(time.Minute)); err != nil {
				t.Fatal(err)
			}
			if _, err := logs.Log(ctx, entries[4].ID); err != core.ErrNotFound {
				t.Fatal("old read kept", err)
			}
			if _, err := logs.Log(ctx, entries[0].ID); err != nil {
				t.Fatal("write pruned too early", err)
			}
		})
	}
}
