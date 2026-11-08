package api

import (
	"encoding/json"
	"testing"
)

func adminLoginToken(t *testing.T, a *Server, username, password string) string {
	t.Helper()
	w := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": username, "password": password})
	if w.Code != 200 {
		t.Fatal("login failed", username, w.Code, w.Body.String())
	}
	return w.Result().Cookies()[0].Value
}

func TestCustomRoleMenusGateAdminRoutes(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	role := call(a, "POST", "/api/admin/roles", admin, "", map[string]any{"name": "任务查看", "scope": "platform", "menus": []string{"jobs"}})
	if role.Code != 200 {
		t.Fatal(role.Code, role.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(role.Body.Bytes(), &created)
	account := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{"username": "jobs-viewer", "password": "jobs-viewer-password-2026", "name": "任务查看员", "role": created.ID})
	if account.Code != 201 {
		t.Fatal(account.Code, account.Body.String())
	}
	viewer := adminLoginToken(t, a, "jobs-viewer", "jobs-viewer-password-2026")
	if w := call(a, "GET", "/api/admin/jobs", viewer, "", nil); w.Code != 200 {
		t.Fatal("granted menu denied", w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/admin/users", "/api/admin/orders", "/api/admin/partners/tree", "/api/admin/platform"} {
		if w := call(a, "GET", path, viewer, "", nil); w.Code != 403 {
			t.Fatal("ungranted menu reachable", path, w.Code)
		}
	}
	if w := call(a, "POST", "/api/admin/roles", viewer, "", map[string]any{"name": "提权", "scope": "platform", "menus": []string{"roles"}}); w.Code != 403 {
		t.Fatal("non super admin managed roles", w.Code)
	}
	me := call(a, "GET", "/api/admin/me", viewer, "", nil)
	if me.Code != 200 || !json.Valid(me.Body.Bytes()) {
		t.Fatal(me.Code, me.Body.String())
	}
	var info struct {
		Menus []string `json:"menus"`
	}
	if json.Unmarshal(me.Body.Bytes(), &info) != nil || len(info.Menus) != 1 || info.Menus[0] != "jobs" {
		t.Fatal("me did not report granted menus", me.Body.String())
	}
}

func TestProviderRolesCannotHoldPlatformMenus(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	if w := call(a, "POST", "/api/admin/roles", admin, "", map[string]any{"name": "越权服务商", "scope": "partner", "menus": []string{"partners", "users"}}); w.Code != 400 {
		t.Fatal("provider role accepted platform menus", w.Code, w.Body.String())
	}
	if w := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{"username": "fake-provider", "password": "fake-provider-password-2026", "name": "伪服务商", "role": "partner"}); w.Code != 400 {
		t.Fatal("platform account created with a provider role", w.Code)
	}
	if w := call(a, "DELETE", "/api/admin/roles/partner", admin, "", nil); w.Code != 400 {
		t.Fatal("builtin role deleted", w.Code)
	}
}
