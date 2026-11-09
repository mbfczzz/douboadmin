package api

import (
	"strings"
	"testing"
)

func TestAdminStatusReasonStaysOutOfOwnProfile(t *testing.T) {
	a, user, admin := activationFixture(t)
	if w := call(a, "POST", "/api/access/direct", user, "", map[string]any{}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
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
}
