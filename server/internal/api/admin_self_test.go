package api

import (
	"strings"
	"testing"
)

func TestAdminChangesOwnPassword(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	createProvider(t, a, admin, "self-pw", "root", "S1", 3, map[string]string{"username": "self-pw", "password": "self-pw-password-2026"})
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
