package api

import (
	"strings"
	"testing"
)

func TestMembershipDisableUnbindAndRegisterAgain(t *testing.T) {
	a, user, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createBranch(t, a, admin, "members")
	s1 := createProvider(t, a, admin, "members-s1", branch, "S1", "s1", map[string]string{"username": "members-s1", "password": "Ttea1a8a"})
	other := createProvider(t, a, admin, "members-other", branch, "Other", "s1", map[string]string{"username": "members-other", "password": "Tt292a81"})
	code := providerCode(t, a, "GET", s1, "member", admin)
	scan(t, a, "user-a", code.Code)
	change := func(token, status string) (int, string) {
		row, _ := a.Store.Get(t.Context(), "memberships", "user-a")
		w := call(a, "PUT", "/api/admin/memberships/user-a", token, "", map[string]any{"status": status, "reason": "测试变更", "version": row.Version})
		return w.Code, w.Body.String()
	}
	// A pending registration is decided in registrations, not here.
	if status, body := change(admin, "disabled"); status != 400 || !strings.Contains(body, "已开通") {
		t.Fatal("pending member changed", status, body)
	}
	approve(t, a, "user-a")
	if status, _ := change(adminLoginToken(t, a, "members-other", "Tt292a81"), "disabled"); status != 403 {
		t.Fatal("another provider changed the member", status)
	}
	provider := adminLoginToken(t, a, "members-s1", "Ttea1a8a")
	if status, body := change(provider, "disabled"); status != 403 {
		t.Fatal("provider managed account", status, body)
	}
	if status, body := change(admin, "disabled"); status != 200 {
		t.Fatal(status, body)
	}
	if w := call(a, "GET", "/api/templates", user, "", nil); w.Code != 403 {
		t.Fatal("disabled member kept access", w.Code)
	}
	if status, body := joinHTTP(a, user, providerCode(t, a, "GET", other, "member", admin).Code); status != 400 {
		t.Fatal("disabled member registered elsewhere", status, body)
	}
	if status, body := change(admin, "unbound"); status != 200 {
		t.Fatal(status, body)
	}
	if status, body := joinHTTP(a, user, providerCode(t, a, "GET", other, "member", admin).Code); status != 200 || !strings.Contains(body, `"status":"review"`) || !strings.Contains(body, other) {
		t.Fatal("unbound member could not register again", status, body)
	}
}
