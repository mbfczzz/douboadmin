package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestLimitedRolesCannotExpandPermissionsWithMenus(t *testing.T) {
	forbidden := []struct{ method, path string }{
		{"GET", "/api/admin/users"}, {"GET", "/api/admin/accounts"}, {"GET", "/api/admin/roles"}, {"GET", "/api/admin/overview"}, {"GET", "/api/admin/templates"}, {"GET", "/api/admin/audit"},
		{"GET", "/api/admin/partners/id/codes/member"}, {"GET", "/api/admin/partners/id/member-registrations"}, {"GET", "/api/admin/users/id/activity"}, {"GET", "/api/admin/registrations"},
		{"POST", "/api/admin/commission-payouts"}, {"PUT", "/api/admin/commission-payouts/id"}, {"PUT", "/api/admin/partner-policy"}, {"GET", "/api/admin/platform"},
	}
	for _, role := range []string{"operator", "branch", "s1", "s2", "custom-admin", ""} {
		for _, route := range forbidden {
			if menuAllowed(role, core.AdminMenus, route.method, route.path) {
				t.Fatalf("%s allowed %s %s", role, route.method, route.path)
			}
		}
	}
	for _, route := range forbidden {
		if !menuAllowed(core.SuperAdminRole, nil, route.method, route.path) {
			t.Fatal("super admin lost permission")
		}
	}
}

func TestSubordinateActivityScopeAndCursor(t *testing.T) {
	a, _, super := activationFixture(t)
	parent := createProvider(t, a, super, "scope-parent-full", "root", "上级", "branch", map[string]string{"username": "scope-parent-full", "password": "Parent12"})
	child := createProvider(t, a, super, "scope-child-full", parent, "下级", "s1", map[string]string{"username": "scope-child-full", "password": "Child123"})
	other := createBranch(t, a, super, "other-full")
	token := adminLoginToken(t, a, "scope-parent-full", "Parent12")
	_, _ = a.Store.Put(t.Context(), "memberships", core.Record{ID: "child-member", Data: core.Data(core.Membership{PartnerID: child, Status: "active"})}, 0)
	_, _ = a.Store.Put(t.Context(), "memberships", core.Record{ID: "unbound-member", Data: core.Data(core.Membership{PartnerID: child, Status: "unbound"})}, 0)
	_, _ = a.Store.Put(t.Context(), "memberships", core.Record{ID: "own-member", Data: core.Data(core.Membership{PartnerID: parent, Status: "active"})}, 0)
	entries := []core.AuditEntry{}
	for i := 1; i <= 60; i++ {
		entries = append(entries, core.AuditEntry{ID: fmt.Sprintf("%026d", i), At: time.Now(), Category: core.LogBusiness, ActorType: "provider", ActorID: adminID("scope-child-full"), ActorName: "下级", Action: "调整比例", Summary: "测试轨迹", Status: 200, Request: "secret-body", IP: "private-ip"})
	}
	entries = append(entries, core.AuditEntry{ID: fmt.Sprintf("%026d", 61), Category: core.LogAuth, ActorType: "user", ActorID: "child-member", Action: "会员登录", Status: 200}, core.AuditEntry{ID: fmt.Sprintf("%026d", 62), Category: core.LogBusiness, ActorType: "user", ActorID: "unbound-member", Action: "unbound-secret", Status: 200}, core.AuditEntry{ID: fmt.Sprintf("%026d", 63), Category: core.LogBusiness, ActorType: "provider", ActorID: adminID("scope-parent-full"), Action: "parent-secret", Status: 200})
	entries = append(entries, core.AuditEntry{ID: fmt.Sprintf("%026d", 64), Category: core.LogBusiness, ActorType: "user", ActorID: "own-member", Action: "会员活动", Status: 200})
	if err := a.Store.(store.AuditLogs).AppendLogs(t.Context(), entries); err != nil {
		t.Fatal(err)
	}
	base := "/api/admin/partners/" + child + "/activity"
	w := call(a, "GET", base, token, "", nil)
	var first core.AuditPage
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &first) != nil || len(first.Items) != 50 || first.Next == "" {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, secret := range []string{"secret-body", "private-ip", "parent-secret", "unbound-secret"} {
		if strings.Contains(w.Body.String(), secret) {
			t.Fatal("activity leaked unrelated/private data")
		}
	}
	w = call(a, "GET", base+"?before="+first.Next, token, "", nil)
	var next core.AuditPage
	if json.Unmarshal(w.Body.Bytes(), &next) != nil || len(next.Items) != 11 || next.Next != "" {
		t.Fatal("incorrect scoped pagination", w.Body.String())
	}
	for _, id := range []string{other, "root"} {
		if w = call(a, "GET", "/api/admin/partners/"+id+"/activity", token, "", nil); w.Code != 403 {
			t.Fatal("out-of-scope activity allowed", id, w.Code)
		}
	}
	if own := call(a, "GET", "/api/admin/partners/"+parent+"/activity", token, "", nil); own.Code != 200 || strings.Contains(own.Body.String(), "parent-secret") || !strings.Contains(own.Body.String(), "own-member") {
		t.Fatal("own activity must contain members only", own.Body.String())
	}
	if w = call(a, "GET", "/api/admin/commission-ledger?owner="+other, token, "", nil); w.Code != 403 {
		t.Fatal("other branch commission allowed")
	}
}

func TestUnassignedNonSuperHasNoGlobalScope(t *testing.T) {
	a, _, super := activationFixture(t)
	branch := createBranch(t, a, super, "unassigned-scope")
	w := call(a, "POST", "/api/admin/accounts", super, "", map[string]string{"username": "limited-operator", "name": "普通后台", "role": "operator", "password": "Tester12"})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	token := adminLoginToken(t, a, "limited-operator", "Tester12")
	if w = call(a, "GET", "/api/admin/partners/"+branch, token, "", nil); w.Code != 403 {
		t.Fatal("unassigned operator had global scope")
	}
	w = call(a, "GET", "/api/admin/partners/tree?page=1", token, "", nil)
	var page struct {
		Items []any
		Total int
	}
	_ = json.Unmarshal(w.Body.Bytes(), &page)
	if w.Code != 200 || page.Total != 0 || len(page.Items) != 0 {
		t.Fatal("unassigned tree not empty", w.Body.String())
	}
	_, _ = a.Store.Put(t.Context(), "commission_ledger", core.Record{ID: "hidden-commission", Owner: branch, Data: core.Data(map[string]any{"kind": "sale", "amountFen": 100})}, 0)
	if ledger := call(a, "GET", "/api/admin/commission-ledger", token, "", nil); ledger.Code != 200 || strings.Contains(ledger.Body.String(), "hidden-commission") {
		t.Fatal("unassigned commission scope leaked", ledger.Body.String())
	}
	w = call(a, "GET", "/api/admin/me", token, "", nil)
	var me struct{ Menus []string }
	_ = json.Unmarshal(w.Body.Bytes(), &me)
	if len(me.Menus) != 1 || me.Menus[0] != "partners" {
		t.Fatal("unexpected menus", w.Body.String())
	}
}
