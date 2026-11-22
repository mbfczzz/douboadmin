package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestInitialAdminRejectsInvalidConfigWithoutChangingAccounts(t *testing.T) {
	for _, tc := range []struct{ username, password string }{
		{"bad/name", "FilePw12"}, {"admin", "short"}, {"admin", "abcdefgh"}, {"admin", "Abcdefg!"},
	} {
		a, _, _ := setup(t)
		a.Config.AdminUser, a.Config.AdminPassword = tc.username, tc.password
		if changed, err := a.SyncInitialAdmin(t.Context()); err == nil || changed || strings.Contains(err.Error(), tc.password) {
			t.Fatal("invalid config accepted or its secret leaked", changed)
		}
		rows, err := a.Store.List(t.Context(), "admin_accounts", "")
		if err != nil || len(rows) != 0 {
			t.Fatal("invalid config created an account", err)
		}
	}
}

func TestInitialAdminDoesNotPromoteAnExistingOperator(t *testing.T) {
	a, admin, _ := integrationAdmin(t)
	w := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{"username": "config-user", "password": "DbPass12", "name": "Existing", "role": "operator"})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	before, _ := a.Store.Get(t.Context(), "admin_accounts", adminID("config-user"))
	a.Config.AdminUser, a.Config.AdminPassword = "config-user", "FilePw12"
	if changed, err := a.SyncInitialAdmin(t.Context()); err == nil || changed {
		t.Fatal("environment account collision silently granted super-admin authority")
	}
	after, _ := a.Store.Get(t.Context(), "admin_accounts", before.ID)
	if before.Version != after.Version || string(before.Data) != string(after.Data) {
		t.Fatal("colliding account was modified")
	}
}

func TestInitialAdminPreservesDisabledAndArchivedFlags(t *testing.T) {
	for _, archived := range []bool{false, true} {
		a, admin, _ := integrationAdmin(t)
		row, _ := a.Store.Get(t.Context(), "admin_accounts", adminID("admin"))
		var account core.AdminAccount
		_ = json.Unmarshal(row.Data, &account)
		account.Disabled, account.Archived = true, archived
		row.Data = core.Data(account)
		if _, err := a.Store.Put(t.Context(), "admin_accounts", row, row.Version); err != nil {
			t.Fatal(err)
		}
		a.Config.AdminPassword = "FilePw12"
		if changed, err := a.SyncInitialAdmin(t.Context()); err != nil || !changed {
			t.Fatal(changed, err)
		}
		after, _ := a.Store.Get(t.Context(), "admin_accounts", row.ID)
		_ = json.Unmarshal(after.Data, &account)
		if !account.Disabled || account.Archived != archived || call(a, "GET", "/api/admin/me", admin, "", nil).Code != 403 {
			t.Fatal("startup reenabled a disabled initial administrator")
		}
		if w := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "FilePw12"}); w.Code != 401 {
			t.Fatal("disabled account logged in after config sync", w.Code)
		}
	}
}
