package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestRoleDisplayCatalogKeepsPermissionDefinitionsPrivate(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	w := call(a, "POST", "/api/admin/roles", admin, "", map[string]any{"name": "用户查看员", "scope": "platform", "menus": []string{"users"}})
	var custom roleView
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &custom) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{"username": "role-label-reader", "password": "role-label-password-2026", "name": "用户查看员", "role": custom.ID})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	token := adminLoginToken(t, a, "role-label-reader", "role-label-password-2026")
	w = call(a, "GET", "/api/admin/roles/labels", token, "", nil)
	var labels map[string]string
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &labels) != nil || len(labels) != 4 || labels[core.RoleS1] != "S1 服务商" {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/admin/roles", token, "", nil); w.Code != 403 {
		t.Fatal("label reader gained permission definitions")
	}
	if w = call(a, "PUT", "/api/admin/roles/s1", token, "", map[string]any{}); w.Code != 403 {
		t.Fatal("label reader gained role editing")
	}
}
