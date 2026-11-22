package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
)

func TestInitialAdminStartupCreatesConfiguredIdentity(t *testing.T) {
	a, _, _ := setup(t)
	a.Config.AdminUser, a.Config.AdminPassword = "root.config", "FilePw12"
	changed, err := a.SyncInitialAdmin(t.Context())
	if err != nil || !changed {
		t.Fatal(changed, err)
	}
	token := adminLoginToken(t, a, "root.config", "FilePw12")
	if w := call(a, "GET", "/api/admin/me", token, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err := a.Store.Get(t.Context(), "admin_accounts", adminID("admin")); err == nil {
		t.Fatal("hard-coded default admin was created")
	}
	if w := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "root.config", "password": "Doubo123"}); w.Code != 401 {
		t.Fatal("default password accepted for configured identity", w.Code)
	}
}

func TestInitialAdminStartupSynchronizesPasswordAndRevokesOnlyItsSessions(t *testing.T) {
	a, admin, _ := integrationAdmin(t)
	otherID, otherToken := secondaryAdmin(t, a, admin)
	otherBefore, _ := a.Store.Get(t.Context(), "admin_accounts", otherID)
	row, _ := a.Store.Get(t.Context(), "admin_accounts", adminID("admin"))
	var account core.AdminAccount
	_ = json.Unmarshal(row.Data, &account)
	account.Name, account.Phone = "自定义管理员", "13800138000"
	row.Data = core.Data(account)
	if _, err := a.Store.Put(t.Context(), "admin_accounts", row, row.Version); err != nil {
		t.Fatal(err)
	}
	a.Config.AdminPassword = "NewPwd12"
	changed, err := a.SyncInitialAdmin(t.Context())
	if err != nil || !changed {
		t.Fatal(changed, err)
	}
	if w := call(a, "GET", "/api/admin/me", admin, "", nil); w.Code != 401 {
		t.Fatal("old initial-admin session survived config password rotation", w.Code)
	}
	if w := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "Tt661ea2"}); w.Code != 401 {
		t.Fatal("previous database password survived rotation", w.Code)
	}
	newToken := adminLoginToken(t, a, "admin", "NewPwd12")
	if w := call(a, "GET", "/api/admin/me", newToken, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	updated, _ := a.Store.Get(t.Context(), "admin_accounts", row.ID)
	_ = json.Unmarshal(updated.Data, &account)
	if account.Name != "自定义管理员" || account.Phone != "13800138000" {
		t.Fatal("profile was overwritten by startup configuration")
	}
	otherAfter, _ := a.Store.Get(t.Context(), "admin_accounts", otherID)
	if string(otherBefore.Data) != string(otherAfter.Data) || otherBefore.Version != otherAfter.Version || call(a, "GET", "/api/admin/me", otherToken, "", nil).Code != 200 {
		t.Fatal("unrelated account or its session was modified")
	}
}

func TestInitialAdminUnchangedConfigPreservesPasswordHashAndSessions(t *testing.T) {
	a, _, _ := setup(t)
	if _, err := a.SyncInitialAdmin(t.Context()); err != nil {
		t.Fatal(err)
	}
	token := adminLoginToken(t, a, "admin", "Tt661ea2")
	before, _ := a.Store.Get(t.Context(), "admin_accounts", adminID("admin"))
	changed, err := a.SyncInitialAdmin(t.Context())
	after, _ := a.Store.Get(t.Context(), "admin_accounts", before.ID)
	if err != nil || changed || before.Version != after.Version || string(before.Data) != string(after.Data) || call(a, "GET", "/api/admin/me", token, "", nil).Code != 200 {
		t.Fatal("unchanged startup unexpectedly rewrote credentials or ended a session", changed, err)
	}
}

func TestInitialAdminConcurrentStartupCreatesOnlyOneAccount(t *testing.T) {
	a, _, _ := setup(t)
	var changes atomic.Int32
	var group sync.WaitGroup
	for range 6 {
		group.Go(func() {
			changed, err := a.SyncInitialAdmin(t.Context())
			if err != nil {
				t.Error(err)
			}
			if changed {
				changes.Add(1)
			}
		})
	}
	group.Wait()
	rows, err := a.Store.List(t.Context(), "admin_accounts", "")
	if err != nil || len(rows) != 1 || rows[0].Version != 1 || changes.Load() != 1 {
		t.Fatal("concurrent startup duplicated or repeatedly reset the initial account", changes.Load(), err)
	}
}
