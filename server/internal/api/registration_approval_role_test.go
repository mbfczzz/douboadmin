package api

import (
	"encoding/json"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestRegistrationOpeningRequiresActualSuperAdminRole(t *testing.T) {
	a, user, legacy := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	branch := createBranch(t, a, admin, "role-opening")
	code := providerCode(t, a, "GET", branch, "member", admin)
	scan(t, a, "user-a", code.Code)
	_, e := a.Store.Put(t.Context(), "admin_roles", core.Record{ID: "pretend-super", Data: core.Data(core.AdminRole{
		Name: "超级管理员", Scope: core.RoleScopePlatform, Menus: core.AdminMenus,
	})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	tokens := []string{legacy, user, reviewLogin(t, a, admin, branch)}
	for _, role := range []string{"operator", "pretend-super"} {
		name := "review-" + role
		w := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{
			"username": name, "password": "review-role-password-2026", "name": "超级管理员", "role": role,
		})
		if w.Code != 201 {
			t.Fatal(w.Code, w.Body.String())
		}
		tokens = append(tokens, adminLoginToken(t, a, name, "review-role-password-2026"))
	}
	for _, token := range tokens {
		if token != user {
			me := call(a, "GET", "/api/admin/me", token, "", nil)
			if me.Code != 200 || !strings.Contains(me.Body.String(), `"canApproveRegistrations":false`) {
				t.Fatal("incorrect opening capability", me.Body.String())
			}
		}
		if status, body := decideHTTP(t, a, token, "user-a", true, ""); status != 403 {
			t.Fatal("non-super role opened user", status, body)
		}
	}
	before, _ := a.Store.Get(t.Context(), "registrations", "user-a")
	if before.Version != 1 || accessOf(t, a, user).Active {
		t.Fatal("denied opening mutated user")
	}
	me := call(a, "GET", "/api/admin/me", admin, "", nil)
	if !strings.Contains(me.Body.String(), `"canApproveRegistrations":true`) {
		t.Fatal("super role capability missing", me.Body.String())
	}
	if status, body := decideHTTP(t, a, admin, "user-a", true, ""); status != 200 {
		t.Fatal("super role cannot open user", status, body)
	}
	if !accessOf(t, a, user).Active {
		t.Fatal("successful opening did not activate user")
	}
}

func TestSuperAdminDemotionRevokesOpeningOnExistingSession(t *testing.T) {
	a, user, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	id, formerSuper := secondaryAdmin(t, a, admin)
	branch := createBranch(t, a, admin, "demoted-review")
	code := providerCode(t, a, "GET", branch, "s1", admin)
	scan(t, a, "user-a", code.Code)
	row, _ := a.Store.Get(t.Context(), "admin_accounts", id)
	w := call(a, "PUT", "/api/admin/accounts/"+id, admin, "", map[string]any{
		"version": row.Version, "name": "Secondary", "role": "operator", "disabled": false,
	})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	page := registrationPage(t, a, formerSuper, "?status=pending")
	var capabilities struct{ CanReview, CanApprove bool }
	if page.Total != 1 || json.Unmarshal(page.Items[0].Data, &capabilities) != nil || capabilities.CanReview || capabilities.CanApprove {
		t.Fatal("demoted account still sees approval", page)
	}
	if status, body := decideHTTP(t, a, formerSuper, "user-a", true, ""); status != 403 {
		t.Fatal("old session retained approval", status, body)
	}
	if accessOf(t, a, user).Active {
		t.Fatal("demoted account activated user")
	}
}
