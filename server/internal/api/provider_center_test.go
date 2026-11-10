package api

import (
	"doubo/server/internal/settings"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestS2InviteMakesASubProviderWithItsOwnLogin(t *testing.T) {
	a, user, _ := activationFixture(t)
	a.Integrations = settings.New(a.Store, filepath.Join(t.TempDir(), "key"), nil)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	s1 := createProvider(t, a, admin, "inv-s1", createBranch(t, a, admin, "inv"), "S1", "s1", map[string]string{"username": "inv-s1", "password": "inv-s1-password-2026"})
	path := "/api/admin/partners/" + s1 + "/codes/s2"
	invite := providerCode(t, a, "GET", s1, "s2", admin)
	if !strings.HasPrefix(invite.QR, "data:image/png;base64,") {
		t.Fatal("invite QR missing")
	}
	s1Login := adminLoginToken(t, a, "inv-s1", "inv-s1-password-2026")
	if w := call(a, "GET", path, s1Login, "", nil); w.Code != 200 || !strings.Contains(w.Body.String(), invite.Code) {
		t.Fatal("S1 cannot see its invite", w.Code, w.Body.String())
	}
	if status, body := joinHTTP(a, user, invite.Code); status != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(status, body)
	}
	if w := call(a, "GET", "/api/provider", user, "", nil); w.Code != 403 {
		t.Fatal("a pending provider opened the provider center", w.Code)
	}
	approve(t, a, "user-a")
	var center struct {
		Name, Role, Account string
		Owner               bool
		Codes               map[string]shareView
		Children            []childView
	}
	w := call(a, "GET", "/api/provider", user, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &center) != nil || center.Name != "测试用户" || center.Role != "s2" || !center.Owner || center.Account != "" {
		t.Fatal(w.Code, w.Body.String())
	}
	if len(center.Codes) != 1 || center.Codes["member"].Code == "" || center.Codes["member"].Code == invite.Code || strings.Contains(w.Body.String(), `"children"`) {
		t.Fatal("S2 center", w.Body.String())
	}
	var login struct{ Account, Password string }
	w = call(a, "POST", "/api/provider/password", user, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &login) != nil || login.Account != "13800138000" || len(login.Password) != 20 {
		t.Fatal(w.Code, w.Body.String())
	}
	s2, _ := a.Partners.OwnedPartner(t.Context(), "user-a")
	token := adminLoginToken(t, a, login.Account, login.Password)
	if w = call(a, "GET", "/api/admin/partners/"+s2, token, "", nil); w.Code != 200 {
		t.Fatal("S2 cannot open itself", w.Code, w.Body.String())
	}
	if w = call(a, "GET", path, token, "", nil); w.Code != 403 {
		t.Fatal("S2 read its parent's invite", w.Code)
	}
	if w = call(a, "GET", "/api/admin/partners/"+s2+"/codes/s2", token, "", nil); w.Code != 400 {
		t.Fatal("S2 got an invite code", w.Code, w.Body.String())
	}
	// The provider center keeps showing the current password.
	if saved := centerPassword(t, a, user); saved != login.Password {
		t.Fatal("saved password", saved)
	}
	// Once S1 changes it in the admin, the old one is no longer shown.
	acct := call(a, "GET", "/api/admin/partners/"+s2+"/account", s1Login, "", nil)
	var current struct{ Account struct{ Version int64 } }
	_ = json.Unmarshal(acct.Body.Bytes(), &current)
	if w = call(a, "PUT", "/api/admin/partners/"+s2+"/account", s1Login, "", map[string]any{"version": current.Account.Version, "password": "changed-by-parent-2026"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if saved := centerPassword(t, a, user); saved != "" {
		t.Fatal("stale password shown", saved)
	}
	// A reset in the mini-program shows the new one again.
	if w = call(a, "POST", "/api/provider/password", user, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &login) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	adminLoginToken(t, a, login.Account, login.Password)
	if saved := centerPassword(t, a, user); saved != login.Password {
		t.Fatal("reset password not shown", saved)
	}
}

func centerPassword(t *testing.T, a *Server, user string) string {
	t.Helper()
	var v struct{ Password string }
	w := call(a, "GET", "/api/provider", user, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &v) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return v.Password
}
