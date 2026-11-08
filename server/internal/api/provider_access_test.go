package api

import (
	"encoding/json"
	"strings"
	"testing"
)

func createProvider(t *testing.T, a *Server, token, key, parent, name string, users int, account map[string]string) string {
	t.Helper()
	body := map[string]any{"parentId": parent, "name": name, "users": users}
	if account != nil {
		body["account"] = account
	}
	w := call(a, "POST", "/api/admin/partners", token, "provider-test-"+key, body)
	if w.Code != 200 {
		t.Fatal("create provider", name, w.Code, w.Body.String())
	}
	var row struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &row)
	return row.ID
}

func TestProviderAccountSeesOnlyItsSubtree(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	s1 := createProvider(t, a, admin, "p-s1", "root", "S1", 10, map[string]string{"username": "s1-login", "password": "s1-login-password-2026"})
	other := createProvider(t, a, admin, "p-other", "root", "Other", 5, nil)
	child := createProvider(t, a, admin, "p-child", s1, "S1-child", 3, nil)
	provider := adminLoginToken(t, a, "s1-login", "s1-login-password-2026")

	tree := call(a, "GET", "/api/admin/partners/tree", provider, "", nil)
	if tree.Code != 200 || strings.Contains(tree.Body.String(), other) || !strings.Contains(tree.Body.String(), child) {
		t.Fatal("tree not limited to subtree", tree.Body.String())
	}
	for _, path := range []string{"/api/admin/users", "/api/admin/orders", "/api/admin/accounts", "/api/admin/platform", "/api/admin/partner-policy"} {
		if w := call(a, "GET", path, provider, "", nil); w.Code != 403 {
			t.Fatal("provider reached platform data", path, w.Code)
		}
	}
	denied := []struct {
		method, path string
		body         any
	}{
		{"GET", "/api/admin/partners/" + other, nil},
		{"GET", "/api/admin/partners/root", nil},
		{"POST", "/api/admin/partners", map[string]any{"parentId": other, "name": "越界", "users": 1}},
		{"PUT", "/api/admin/partners/" + s1, map[string]any{"version": 1, "data": map[string]any{"name": "改自己", "status": "active", "retailPer100Fen": 10000, "childMarginBps": 5000}}},
		{"POST", "/api/admin/activation-codes", map[string]any{"partnerId": other, "label": "越界", "days": 7}},
		{"POST", "/api/admin/quota-requests", map[string]any{"partnerId": other, "users": 1, "reason": "越界申请"}},
		{"GET", "/api/admin/memberships?provider=" + other, nil},
		{"GET", "/api/admin/partners/" + other + "/account", nil},
	}
	for _, c := range denied {
		if w := call(a, c.method, c.path, provider, "provider-deny-check-key", c.body); w.Code != 403 {
			t.Fatal("cross-provider access allowed", c.method, c.path, w.Code, w.Body.String())
		}
	}
	codes := call(a, "GET", "/api/admin/activation-codes", provider, "", nil)
	if codes.Code != 200 {
		t.Fatal(codes.Code, codes.Body.String())
	}
	if w := call(a, "GET", "/api/admin/partners/"+child, provider, "", nil); w.Code != 200 {
		t.Fatal("own child overview denied", w.Code, w.Body.String())
	}
	createProvider(t, a, provider, "p-grandchild", child, "S1-grandchild", 1, map[string]string{"username": "s1-grand", "password": "s1-grand-password-2026"})
	if w := call(a, "PUT", "/api/admin/partners/"+child, provider, "", map[string]any{"version": 1, "data": map[string]any{"name": "S1-child", "status": "active", "retailPer100Fen": 99999, "childMarginBps": 5000}}); w.Code != 400 {
		t.Fatal("descendant priced above its provider", w.Code, w.Body.String())
	}
	accounts := call(a, "GET", "/api/admin/accounts", admin, "", nil)
	if strings.Contains(accounts.Body.String(), "s1-login") {
		t.Fatal("provider login listed under 管理账号")
	}
	if w := call(a, "PUT", "/api/admin/accounts/"+adminID("s1-login"), admin, "", map[string]any{"version": 1, "name": "x", "role": "operator"}); w.Code != 400 {
		t.Fatal("provider login edited from 管理账号", w.Code)
	}
}
