package api

import (
	"strings"
	"testing"
)

func registerWith(t *testing.T, a *Server, token, phone string) string {
	t.Helper()
	a.Sessions.limits = map[string]bucket{} // allow back-to-back sends
	code := sendCode(t, a, token, phone)
	return call(a, "POST", "/api/access/profile", token, "", map[string]string{"name": "用户", "phone": phone, "code": code}).Body.String()
}

func TestVerifiedPhoneBelongsToOneAccount(t *testing.T) {
	a, _, admin := activationFixture(t)
	one, two := newMiniUser(t, a, "user-one"), newMiniUser(t, a, "user-two")
	const p, q = "13900139020", "13900139021"
	// Two obtains a code first; one then verifies the same phone.
	a.Sessions.limits = map[string]bucket{}
	early := sendCode(t, a, two, p)
	if b := registerWith(t, a, one, p); !strings.Contains(b, `"profileRequired":false`) {
		t.Fatal(b)
	}
	b := call(a, "POST", "/api/access/profile", two, "", map[string]string{"name": "用户", "phone": p, "code": early}).Body.String()
	if !strings.Contains(b, errPhoneTaken) {
		t.Fatal("second account verified a taken phone", b)
	}
	a.Sessions.limits = map[string]bucket{}
	if w := call(a, "POST", "/api/access/sms", two, "", map[string]string{"phone": p}); w.Code != 400 || !strings.Contains(w.Body.String(), errPhoneTaken) {
		t.Fatal("code sent to a taken phone", w.Code, w.Body.String())
	}
	row, _ := a.Store.Get(t.Context(), "users", "user-two")
	if w := call(a, "PUT", "/api/admin/users/user-two", admin, "", map[string]any{"version": row.Version, "nickname": "n", "phone": p}); w.Code != 400 {
		t.Fatal("admin assigned a taken phone", w.Code, w.Body.String())
	}
	// One moves to a new number; the old one becomes free.
	row, _ = a.Store.Get(t.Context(), "users", "user-one")
	if w := call(a, "PUT", "/api/admin/users/user-one", admin, "", map[string]any{"version": row.Version, "nickname": "n", "name": "用户", "phone": q}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if b := registerWith(t, a, one, q); !strings.Contains(b, `"profileRequired":false`) {
		t.Fatal(b)
	}
	if b := registerWith(t, a, two, p); !strings.Contains(b, `"profileRequired":false`) {
		t.Fatal("released phone still reserved", b)
	}
	// Archiving an account frees its number too.
	row, _ = a.Store.Get(t.Context(), "users", "user-two")
	if w := call(a, "DELETE", "/api/admin/users/user-two", admin, "", map[string]any{"version": row.Version, "reason": "用户注销"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	three := newMiniUser(t, a, "user-three")
	if b := registerWith(t, a, three, p); !strings.Contains(b, `"profileRequired":false`) {
		t.Fatal("archived account kept the phone", b)
	}
}
