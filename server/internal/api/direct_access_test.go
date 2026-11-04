package api

import (
	"doubo/server/internal/core"
	"errors"
	"strings"
	"testing"
)

func TestDirectApplicationAutoApprovesWithoutPartnerMembership(t *testing.T) {
	a, user, admin := activationFixture(t)
	w := call(a, "POST", "/api/access/direct", user, "", map[string]any{})
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"direct"`) {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err := a.Store.Get(t.Context(), "memberships", "user-a"); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("direct user received provider membership", err)
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("direct user remained blocked", w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/admin/users", admin, "", nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"direct"`) {
		t.Fatal(w.Code, w.Body.String())
	}
	snapshot, units, err := a.Partners.UserQuote(t.Context(), "user-a", 10000, 100)
	if err != nil || snapshot != nil || units != 1000000 {
		t.Fatal("direct user pricing used provider distribution", snapshot, units, err)
	}
}

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
