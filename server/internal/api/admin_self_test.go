package api

import (
	"strings"
	"testing"
)

func TestAdminChangesOwnPassword(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	createProvider(t, a, admin, "self-pw", "root", "分公司", "branch", map[string]string{"username": "self-pw", "password": "self-pw-password-2026"})
	old := adminLoginToken(t, a, "self-pw", "self-pw-password-2026")
	second := adminLoginToken(t, a, "self-pw", "self-pw-password-2026")
	if w := call(a, "PUT", "/api/admin/me/password", old, "", map[string]string{"current": "wrong-password-0000", "next": "new-password-2026-ok"}); w.Code != 400 || !strings.Contains(w.Body.String(), "当前密码不正确") {
		t.Fatal("wrong current accepted", w.Code, w.Body.String())
	}
	if w := call(a, "PUT", "/api/admin/me/password", old, "", map[string]string{"current": "self-pw-password-2026", "next": "short"}); w.Code != 400 {
		t.Fatal("short password accepted", w.Code)
	}
	w := call(a, "PUT", "/api/admin/me/password", old, "", map[string]string{"current": "self-pw-password-2026", "next": "new-password-2026-ok"})
	if w.Code != 200 || len(w.Result().Cookies()) == 0 {
		t.Fatal(w.Code, w.Body.String())
	}
	fresh := w.Result().Cookies()[0].Value
	if w := call(a, "GET", "/api/admin/me", fresh, "", nil); w.Code != 200 {
		t.Fatal("caller lost its session", w.Code)
	}
	if w := call(a, "GET", "/api/admin/me", second, "", nil); w.Code != 401 {
		t.Fatal("other session survived a password change", w.Code)
	}
	adminLoginToken(t, a, "self-pw", "new-password-2026-ok")
}

// Signing in records the time without bumping the account version, so an
// admin's open edit of that account does not hit a version conflict.
func TestLoginKeepsAccountVersion(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	id := createProvider(t, a, admin, "ver-key", "root", "V1", "branch", map[string]string{"username": "ver-login", "password": "ver-login-password-2026"})
	before := call(a, "GET", "/api/admin/partners/"+id+"/account", admin, "", nil).Body.String()
	adminLoginToken(t, a, "ver-login", "ver-login-password-2026")
	after := call(a, "GET", "/api/admin/partners/"+id+"/account", admin, "", nil).Body.String()
	if !strings.Contains(before, `"version":1`) || !strings.Contains(after, `"version":1`) {
		t.Fatal("login changed the account version", before, after)
	}
	if !strings.Contains(after, `"lastLoginAt":"20`) {
		t.Fatal("login time not shown", after)
	}
}
