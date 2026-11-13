package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestAccountMutationsRequireSuperAdmin(t *testing.T) {
	a, user, super := activationFixture(t)
	role := core.AdminRole{Name: "账号运营", Scope: core.RoleScopePlatform, Menus: []string{"users", "accounts", "partners"}}
	_, _ = a.Store.Put(t.Context(), "admin_roles", core.Record{ID: "account-ops", Data: core.Data(role)}, 0)
	w := call(a, "POST", "/api/admin/accounts", super, "", map[string]any{"username": "account-ops", "name": "运营", "role": "account-ops", "password": "Tester12"})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	operator := adminLoginToken(t, a, "account-ops", "Tester12")
	branch := createBranch(t, a, super, "authority")
	provider := reviewLogin(t, a, super, branch)
	legacy, _ := a.Sessions.Create(t.Context(), "legacy-admin", "admin")
	for _, token := range []string{operator, provider, legacy} {
		for _, route := range []struct{ method, path string }{
			{"PUT", "/api/admin/accounts/unknown/user"},
			{"POST", "/api/admin/accounts"}, {"PUT", "/api/admin/accounts/unknown"}, {"DELETE", "/api/admin/accounts/unknown"}, {"PUT", "/api/admin/accounts/unknown/password"},
			{"POST", "/api/admin/partners"}, {"PUT", "/api/admin/partners/" + branch + "/account"}, {"GET", "/api/admin/partners/" + branch + "/account"},
			{"PUT", "/api/admin/users/user-a"}, {"PUT", "/api/admin/users/user-a/status"}, {"DELETE", "/api/admin/users/user-a"},
			{"PUT", "/api/admin/memberships/user-a"}, {"PUT", "/api/admin/registrations/user-a"}, {"POST", "/api/admin/partners/" + branch + "/codes/member"}, {"DELETE", "/api/admin/partners/" + branch + "/codes/bind"},
		} {
			if got := call(a, route.method, route.path, token, "", map[string]any{}); got.Code != 403 {
				t.Fatalf("%s %s status=%d", route.method, route.path, got.Code)
			}
		}
	}
	if got := call(a, "POST", "/api/provider/password", user, "", nil); got.Code != 403 {
		t.Fatal("mini reset allowed")
	}
	if got := call(a, "PUT", "/api/admin/me/password", operator, "", map[string]string{"current": "Tester12", "next": "Changed8"}); got.Code != 200 {
		t.Fatal("own password change blocked", got.Code, got.Body.String())
	}
}

func TestSuperAdminCanDeleteProviderLoginWithoutDeletingBusiness(t *testing.T) {
	a, _, super := activationFixture(t)
	branch := createProvider(t, a, super, "delete-login", "root", "保留业务", "branch", map[string]string{"username": "delete-login", "password": "Delete12"})
	session := adminLoginToken(t, a, "delete-login", "Delete12")
	row, _, _, err := a.providerAccount(t.Context(), branch)
	if err != nil {
		t.Fatal(err)
	}
	if w := call(a, "DELETE", "/api/admin/accounts/"+row.ID, super, "", map[string]any{"version": row.Version}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "GET", "/api/admin/me", session, "", nil); w.Code < 400 {
		t.Fatal("deleted login still active")
	}
	if _, err := a.Store.Get(t.Context(), "partners", branch); err != nil {
		t.Fatal("business history deleted", err)
	}
	current, err := a.Store.Get(t.Context(), "admin_accounts", row.ID)
	if err != nil {
		t.Fatal(err)
	}
	var account core.AdminAccount
	_ = json.Unmarshal(current.Data, &account)
	if !account.Archived || !account.Disabled {
		t.Fatal("login not disabled and removed")
	}
	if list := call(a, "GET", "/api/admin/accounts", super, "", nil); strings.Contains(list.Body.String(), row.ID) {
		t.Fatal("deleted login still listed")
	}
	own, _ := a.Store.Get(t.Context(), "admin_accounts", adminID("admin"))
	if w := call(a, "DELETE", "/api/admin/accounts/"+own.ID, super, "", map[string]any{"version": own.Version}); w.Code != 409 {
		t.Fatal("self deletion permitted")
	}
}
