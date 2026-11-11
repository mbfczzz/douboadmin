package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"reflect"
	"testing"
)

func TestBusinessRolesShareCatalogWithoutChangingBusinessAccess(t *testing.T) {
	a, _, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	branch := createProvider(t, a, admin, "role-branch", "root", "公司", "branch", nil)
	s1 := createProvider(t, a, admin, "role-s1", branch, "服务商", "s1", nil)
	owner := appUser(t, a, "role-owner", "负责人", "13900001111")
	member := appUser(t, a, "role-member", "会员", "13900001112")
	bindOwner(t, a, s1, "role-owner")
	joinPartner(t, a, s1, "role-member")
	before, _ := a.Store.Get(t.Context(), "partners", s1)
	for _, v := range []struct {
		id, name, token, user, scope string
		menus                        []string
	}{
		{"s1", "专业服务商", owner, "role-owner", "partner", []string{"partners"}},
		{"member", "创作会员", member, "role-member", "user", []string{}},
	} {
		access, _ := a.Partners.Access(t.Context(), v.user)
		w := call(a, "PUT", "/api/admin/roles/"+v.id, admin, "", map[string]any{"version": 0, "name": v.name, "scope": v.scope, "menus": v.menus})
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		for _, endpoint := range []string{"/api/me/role", "/api/me/identity"} {
			w = call(a, "GET", endpoint, v.token, "", nil)
			var got identityView
			if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &got) != nil || got.Kind != v.id || got.Label != v.name {
				t.Fatal(w.Code, w.Body.String())
			}
		}
		w = call(a, "GET", "/api/admin/roles/labels", admin, "", nil)
		var labels map[string]string
		if json.Unmarshal(w.Body.Bytes(), &labels) != nil || labels[v.id] != v.name {
			t.Fatal("business display catalog stale", w.Body.String())
		}
		after, _ := a.Partners.Access(t.Context(), v.user)
		if !reflect.DeepEqual(access, after) {
			t.Fatal("role edit changed approval or business access")
		}
	}
	after, _ := a.Store.Get(t.Context(), "partners", s1)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("role editing changed hierarchy/pricing")
	}
}

func TestCatalogContainsAllBusinessRolesAndPreventsMemberAdminAccess(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	w := call(a, "GET", "/api/admin/roles?page=1", admin, "", nil)
	var page struct {
		Items []roleView `json:"items"`
		Total int        `json:"total"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 7 {
		t.Fatal(w.Code, w.Body.String())
	}
	seen := map[string]bool{}
	for _, row := range page.Items {
		seen[row.ID] = true
	}
	for _, id := range []string{"branch", "s1", "s2", "member"} {
		if !seen[id] {
			t.Fatal("missing business role", id)
		}
		if w = call(a, "DELETE", "/api/admin/roles/"+id, admin, "", nil); w.Code != 400 {
			t.Fatal("business role deletion accepted", id)
		}
	}
	if w = call(a, "PUT", "/api/admin/roles/member", admin, "", map[string]any{"version": 0, "name": "会员", "scope": "user", "menus": []string{"users"}}); w.Code != 400 {
		t.Fatal("member given backend menus", w.Body.String())
	}
	if w = call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{"username": "member-login", "name": "会员", "password": "member-password-2026", "role": "member"}); w.Code != 400 {
		t.Fatal("member assigned backend login", w.Body.String())
	}
	for _, id := range []string{"branch", "s1", "s2"} {
		role, denied, e := a.adminAccess(t.Context(), core.AdminAccount{Role: id})
		if e != nil || denied == "" || role.Scope != "partner" {
			t.Fatal("provider role escaped provider scope", id)
		}
	}
	_, denied, e := a.adminAccess(t.Context(), core.AdminAccount{Role: "member"})
	if e != nil || denied == "" {
		t.Fatal("member gained backend access")
	}
}
