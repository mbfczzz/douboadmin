package api

import (
	"encoding/json"
	"strings"
	"testing"
)

// 下级小程序开通权限 over HTTP: only a super administrator sets it; with it
// off a provider login cannot decide, with it on it opens registrations below.
func TestActivationRightSwitchOverHTTP(t *testing.T) {
	a, _, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createBranch(t, a, admin, "right")
	s1 := createProvider(t, a, admin, "right-s1", branch, "S1", "s1", map[string]string{"username": "right-s1", "password": "Tt707b14"})
	provider := adminLoginToken(t, a, "right-s1", "Tt707b14")
	user := appUser(t, a, "right-user", "张三", "13900007001")
	code := providerCode(t, a, "GET", s1, "member", admin)
	if status, body := joinHTTP(a, user, code.Code); status != 200 {
		t.Fatal(status, body)
	}
	me := func() bool {
		var v struct {
			CanActivateChildren bool `json:"canActivateChildren"`
		}
		w := call(a, "GET", "/api/admin/me", provider, "", nil)
		_ = json.Unmarshal(w.Body.Bytes(), &v)
		return v.CanActivateChildren
	}
	if me() {
		t.Fatal("switch defaults to on")
	}
	if status, body := decideHTTP(t, a, provider, "right-user", true, ""); status != 403 || !strings.Contains(body, "下级小程序开通权限") {
		t.Fatal("provider opened an account with the switch off", status, body)
	}
	set := func(token string, on bool) int {
		row, _ := a.Store.Get(t.Context(), "partners", s1)
		return call(a, "PUT", "/api/admin/partners/"+s1+"/activation", token, "", map[string]any{"enabled": on, "version": row.Version}).Code
	}
	if set(provider, true) != 403 {
		t.Fatal("a provider set its own switch")
	}
	if set(admin, true) != 200 || !me() {
		t.Fatal("super administrator could not turn the switch on")
	}
	if status, body := decideHTTP(t, a, provider, "right-user", true, ""); status != 200 {
		t.Fatal("provider could not open its own registration", status, body)
	}
	if w := call(a, "GET", "/api/access", user, "", nil); !strings.Contains(w.Body.String(), `"active":true`) {
		t.Fatal("account not opened", w.Body.String())
	}
}
