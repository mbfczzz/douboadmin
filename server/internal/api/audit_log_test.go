package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// waitLog polls the store until the async writer has flushed a match.
func waitLog(t *testing.T, a *Server, q core.AuditQuery, ok func(core.AuditEntry) bool) core.AuditEntry {
	t.Helper()
	logs := a.Store.(store.AuditLogs)
	for range 60 {
		page, _ := logs.Logs(context.Background(), q)
		for _, e := range page.Items {
			if ok(e) {
				full, _ := logs.Log(context.Background(), e.ID)
				return full
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("log entry not written")
	return core.AuditEntry{}
}

func TestOperationsAreLoggedWithWhoWhatAndRedactedBodies(t *testing.T) {
	a, user, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	if w := call(a, "POST", "/api/admin/users/user-a/wallet", admin, "adjust-1", map[string]any{"units": 5000, "note": "活动补偿"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{"username": "logged-ops", "name": "运营", "role": "operator", "password": "Secret12"}); w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	activate(t, a, "user-a")
	call(a, "GET", "/api/me", user, "", nil)

	points := waitLog(t, a, core.AuditQuery{Categories: []string{core.LogBusiness}}, func(e core.AuditEntry) bool { return e.Action == "调整用户积分" })
	if points.ActorType != "admin" || points.ActorName == "" || points.TargetID != "user-a" || points.TargetName != "test" || points.Summary != "增加 50 积分（活动补偿）" || points.Status != 200 || !strings.Contains(points.Request, `"units":5000`) {
		t.Fatalf("points entry %+v", points)
	}
	created := waitLog(t, a, core.AuditQuery{}, func(e core.AuditEntry) bool { return e.Action == "创建管理账号" })
	if strings.Contains(created.Request, "Secret12") || !strings.Contains(created.Request, `"password":"***"`) {
		t.Fatal("password logged", created.Request)
	}
	read := waitLog(t, a, core.AuditQuery{Categories: []string{core.LogAPI}}, func(e core.AuditEntry) bool { return e.Path == "/api/me" })
	if read.ActorType != "user" || read.ActorID != "user-a" || !strings.HasSuffix(read.Response, "字节）") {
		t.Fatalf("read entry %+v", read)
	}
	login := waitLog(t, a, core.AuditQuery{Categories: []string{core.LogAuth}}, func(e core.AuditEntry) bool { return e.Action == "管理员登录" })
	// Sign-ins name the account (and its id) whether they succeed or not.
	if login.ActorID == "" || !strings.Contains(login.ActorName, "admin") || strings.Contains(login.Request, "Tt661ea2") {
		t.Fatalf("login entry %+v", login)
	}

	// Admin API: filtered list, detail, points ledger and stats.
	var page core.AuditPage
	_ = json.Unmarshal(call(a, "GET", "/api/admin/audit?tab=business&target=user-a", admin, "", nil).Body.Bytes(), &page)
	if len(page.Items) != 1 || page.Items[0].ID != points.ID || page.Items[0].Request != "" {
		t.Fatalf("list returns light rows: %+v", page.Items)
	}
	var detail core.AuditEntry
	_ = json.Unmarshal(call(a, "GET", "/api/admin/audit/"+points.ID, admin, "", nil).Body.Bytes(), &detail)
	if detail.Request == "" || detail.Response == "" {
		t.Fatal("detail has bodies", detail)
	}
	ledger := call(a, "GET", "/api/admin/audit/points?user=user-a", admin, "", nil).Body.String()
	if !strings.Contains(ledger, `"userName":"test"`) || !strings.Contains(ledger, "活动补偿") {
		t.Fatal("points ledger", ledger)
	}
	if stats := call(a, "GET", "/api/admin/audit/stats?days=7", admin, "", nil).Body.String(); !strings.Contains(stats, `"requests":`) {
		t.Fatal("stats", stats)
	}
	// Reading the log viewer itself is not logged.
	if logs, _ := a.Store.(store.AuditLogs).Logs(context.Background(), core.AuditQuery{Search: "/api/admin/audit"}); len(logs.Items) != 0 {
		t.Fatal("log viewer reads were logged")
	}
}
