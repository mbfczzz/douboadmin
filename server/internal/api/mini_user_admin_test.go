package api

import (
	"strings"
	"testing"
)

func TestAdminCanEditAndArchiveMiniUser(t *testing.T) {
	a, user, admin := activationFixture(t)
	row, _ := a.Store.Get(t.Context(), "users", "user-a")
	w := call(a, "PUT", "/api/admin/users/user-a", admin, "", map[string]any{
		"version": row.Version, "nickname": "新昵称", "name": "用户姓名", "phone": "13800138000", "bio": "更新后的简介",
	})
	if w.Code != 200 || !strings.Contains(w.Body.String(), "新昵称") {
		t.Fatal(w.Code, w.Body.String())
	}
	row, _ = a.Store.Get(t.Context(), "users", "user-a")
	w = call(a, "DELETE", "/api/admin/users/user-a", admin, "", map[string]any{"version": row.Version, "reason": "用户申请注销"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/me", user, "", nil); w.Code != 403 {
		t.Fatal("archived mini user retained access", w.Code)
	}
}
