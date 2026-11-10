package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func TestAdminSeesUserModelUseAndActivity(t *testing.T) {
	a, user, admin := activationFixture(t)
	activate(t, a, "user-a")
	for i, kind := range []string{"image", "image", "import"} {
		j := core.NewJob("user-a", "key-"+string(rune('a'+i)), core.JobInput{Kind: kind, Model: "demo-image", Prompt: "一只猫"})
		if kind == "import" {
			j.Input.Model = "hot-import"
		}
		if _, e := a.Store.CreateJob(t.Context(), j); e != nil {
			t.Fatal(e)
		}
	}
	var models struct {
		Models []modelUse `json:"models"`
		Jobs   []modelJob `json:"jobs"`
	}
	w := call(a, "GET", "/api/admin/users/user-a/models", admin, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &models) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if len(models.Models) != 1 || models.Models[0].Calls != 2 || models.Models[0].Name != "Test model" || models.Models[0].Active != 2 || len(models.Jobs) != 2 {
		t.Fatal("model use", w.Body.String())
	}
	if w = call(a, "GET", "/api/admin/users/user-a/models", user, "", nil); w.Code != 403 {
		t.Fatal("user read admin records", w.Code)
	}
	row, _ := a.Store.Get(t.Context(), "users", "user-a")
	if w = call(a, "PUT", "/api/me", user, "", map[string]any{"version": row.Version, "nickname": "新昵称", "name": "测试用户"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var page core.AuditPage
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline) && len(page.Items) == 0; time.Sleep(50 * time.Millisecond) {
		_ = json.Unmarshal(call(a, "GET", "/api/admin/users/user-a/activity", admin, "", nil).Body.Bytes(), &page)
	}
	if len(page.Items) == 0 || page.Items[0].Action != "修改个人资料" || page.Items[0].ActorID != "user-a" {
		t.Fatal("user activity", page)
	}
	if w = call(a, "GET", "/api/admin/users/user-a/activity/"+page.Items[0].ID, admin, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/admin/users/user-b/activity/"+page.Items[0].ID, admin, "", nil); w.Code != 404 {
		t.Fatal("entry of another user opened", w.Code)
	}
	var all core.AuditPage
	_ = json.Unmarshal(call(a, "GET", "/api/admin/users/user-a/activity?scope=all", admin, "", nil).Body.Bytes(), &all)
	if len(all.Items) <= len(page.Items) {
		t.Fatal("scope=all should include API calls", len(all.Items), len(page.Items))
	}
}

// user-a must not see the entries of user-ab (ids are matched exactly).
func TestUserActivityMatchesTheIDExactly(t *testing.T) {
	a, _, admin := activationFixture(t)
	logs := a.Store.(store.AuditLogs)
	at := time.Now()
	_ = logs.AppendLogs(t.Context(), []core.AuditEntry{
		{ID: fmt.Sprintf("%013x%013d", at.UnixMilli(), 1), At: at, Category: core.LogBusiness, Action: "别人的操作", ActorType: "user", ActorID: "user-ab", ActorName: "user-a 的朋友"},
		{ID: fmt.Sprintf("%013x%013d", at.UnixMilli(), 2), At: at, Category: core.LogBusiness, Action: "自己的操作", ActorType: "user", ActorID: "user-a"},
	})
	var page core.AuditPage
	_ = json.Unmarshal(call(a, "GET", "/api/admin/users/user-a/activity", admin, "", nil).Body.Bytes(), &page)
	if len(page.Items) != 1 || page.Items[0].Action != "自己的操作" {
		t.Fatal("activity of another user leaked", page.Items)
	}
}
