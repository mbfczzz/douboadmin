package api

import (
	"strings"
	"testing"
)

func TestAdminStatusReasonStaysOutOfOwnProfile(t *testing.T) {
	a, user, admin := activationFixture(t)
	activate(t, a, "user-a")
	row, _ := a.Store.Get(t.Context(), "users", "user-a")
	for i, disabled := range []bool{true, false} {
		w := call(a, "PUT", "/api/admin/users/user-a/status", admin, "", map[string]any{"version": row.Version + int64(i), "disabled": disabled, "reason": "内部风控备注"})
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	w := call(a, "GET", "/api/me", user, "", nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), "内部风控备注") {
		t.Fatal("internal status reason leaked to the user", w.Code, w.Body.String())
	}
	current, _ := a.Store.Get(t.Context(), "users", "user-a")
	w = call(a, "PUT", "/api/me", user, "", map[string]any{"version": current.Version, "nickname": "新昵称"})
	if w.Code != 200 || strings.Contains(w.Body.String(), "内部风控备注") {
		t.Fatal("profile save echoed the internal status reason", w.Code, w.Body.String())
	}
	if saved, _ := a.Store.Get(t.Context(), "users", "user-a"); !strings.Contains(string(saved.Data), "内部风控备注") {
		t.Fatal("the reason must stay stored for admins")
	}
}
