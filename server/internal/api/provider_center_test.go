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
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	s1 := createProvider(t, a, admin, "inv-s1", createBranch(t, a, admin, "inv"), "S1", "s1", map[string]string{"username": "inv-s1", "password": "Ttdfa630"})
	path := "/api/admin/partners/" + s1 + "/codes/s2"
	invite := providerCode(t, a, "GET", s1, "s2", admin)
	if !strings.HasPrefix(invite.QR, "data:image/png;base64,") {
		t.Fatal("invite QR missing")
	}
	s1Login := adminLoginToken(t, a, "inv-s1", "Ttdfa630")
	if w := call(a, "GET", path, s1Login, "", nil); w.Code != 403 {
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
	if w := call(a, "POST", "/api/provider/password", user, "", nil); w.Code != 403 {
		t.Fatal("mini-program reset permitted", w.Code)
	}
	s2, _ := a.Partners.OwnedPartner(t.Context(), "user-a")
	path = "/api/admin/partners/" + s2 + "/account"
	if w := call(a, "PUT", path, s1Login, "", map[string]any{"version": 0, "username": "13800138000", "password": "Phone123", "role": "s2"}); w.Code != 403 {
		t.Fatal("parent opened login", w.Code)
	}
	if w := call(a, "PUT", path, admin, "", map[string]any{"version": 0, "username": "13800138000", "password": "Phone123", "role": "s2"}); w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	adminLoginToken(t, a, "13800138000", "Phone123")
	if saved := centerPassword(t, a, user); saved != "" {
		t.Fatal("mini-program exposed managed password")
	}
	if _, saved := providerPasswordView(t, a, s2, admin); saved != "Phone123" {
		t.Fatal("super admin cannot retrieve initial password")
	}
	if w := call(a, "GET", path, s1Login, "", nil); w.Code != 403 {
		t.Fatal("parent accessed account", w.Code)
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
