package api

import (
	"encoding/json"
	"testing"
)

func providerData(t *testing.T, a *Server, token, id string) (int64, map[string]any) {
	t.Helper()
	w := call(a, "GET", "/api/admin/partners/"+id, token, "", nil)
	var out struct {
		Record struct {
			Version int64          `json:"version"`
			Data    map[string]any `json:"data"`
		} `json:"record"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
		t.Fatal("provider overview", w.Code, w.Body.String())
	}
	return out.Record.Version, out.Record.Data
}

func TestProviderCreateRetryAndChildPricing(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	login := map[string]string{"username": "rules-s1", "password": "rules-s1-password-2026"}
	branch := createBranch(t, a, admin, "rules")
	s1 := createProvider(t, a, admin, "rules-s1", branch, "S1", "s1", login)
	// A lost response retried with the same key succeeds instead of "账号已被使用".
	if again := createProvider(t, a, admin, "rules-s1", branch, "S1", "s1", login); again != s1 {
		t.Fatal("retry created another provider", again, s1)
	}
	version, data := providerData(t, a, admin, s1)
	data["childMarginBps"] = 3000
	if w := call(a, "PUT", "/api/admin/partners/"+s1, admin, "", map[string]any{"version": version, "data": data}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	provider := adminLoginToken(t, a, "rules-s1", "rules-s1-password-2026")
	// Only the platform adds providers; the S1 then manages its child.
	child := createProvider(t, a, admin, "rules-child", s1, "S1-child", "s2", nil)
	version, data = providerData(t, a, provider, child)
	if data["childMarginBps"].(float64) != 3000 {
		t.Fatal("new child starts above its parent's margin", data)
	}
	data["name"] = "改名"
	if w := call(a, "PUT", "/api/admin/partners/"+child, provider, "", map[string]any{"version": version, "data": data}); w.Code != 200 {
		t.Fatal("unchanged pricing blocked an edit", w.Code, w.Body.String())
	}
	data["childMarginBps"] = 4000
	if w := call(a, "PUT", "/api/admin/partners/"+child, provider, "", map[string]any{"version": version + 1, "data": data}); w.Code != 400 {
		t.Fatal("margin raised above own", w.Code, w.Body.String())
	}
}

func TestDisabledProviderCannotUseAdmin(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	s1 := createBranch(t, a, admin, "off")
	child := createProvider(t, a, admin, "off-child", s1, "S1-child", "s1", map[string]string{"username": "off-child", "password": "off-child-password-2026"})
	session := adminLoginToken(t, a, "off-child", "off-child-password-2026")
	version, data := providerData(t, a, admin, s1)
	data["status"] = "disabled"
	if w := call(a, "PUT", "/api/admin/partners/"+s1, admin, "", map[string]any{"version": version, "data": data}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "GET", "/api/admin/partners/"+child, session, "", nil); w.Code != 403 {
		t.Fatal("session kept working under a disabled parent", w.Code)
	}
	w := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "off-child", "password": "off-child-password-2026"})
	if w.Code != 403 {
		t.Fatal("login allowed under a disabled parent", w.Code, w.Body.String())
	}
}
