package api

import (
	"strings"
	"testing"
)

func TestProviderAccountSeesOnlyItsSubtree(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createBranch(t, a, admin, "p")
	s1 := createProvider(t, a, admin, "p-s1", branch, "S1", "s1", map[string]string{"username": "s1-login", "password": "Ttdfa24c"})
	other := createProvider(t, a, admin, "p-other", branch, "Other", "s1", nil)
	child := createProvider(t, a, admin, "p-child", s1, "S1-child", "s2", nil)
	provider := adminLoginToken(t, a, "s1-login", "Ttdfa24c")

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
		{"GET", "/api/admin/partners/" + branch, nil},
		{"GET", "/api/admin/partners/" + branch + "/codes/s1", nil},
		{"POST", "/api/admin/partners", map[string]any{"parentId": other, "name": "越界", "role": "s2"}},
		{"POST", "/api/admin/partners", map[string]any{"parentId": s1, "name": "自建", "role": "s2"}},
		{"PUT", "/api/admin/partners/" + s1, map[string]any{"version": 1, "data": map[string]any{"name": "改自己", "status": "active", "retailPer100Fen": 10000, "childMarginBps": 5000}}},
		{"GET", "/api/admin/partners/" + other + "/codes/member", nil},
		{"POST", "/api/admin/partners/" + other + "/codes/member", nil},
		{"DELETE", "/api/admin/partners/" + other + "/codes/bind", nil},
		{"GET", "/api/admin/partners/root/codes/member", nil},
		{"GET", "/api/admin/registrations", nil},
		{"PUT", "/api/admin/registrations/user-a", map[string]any{"approve": true, "version": 1}},
		{"GET", "/api/admin/memberships?provider=" + other, nil},
		{"GET", "/api/admin/partners/" + other + "/account", nil},
	}
	for _, c := range denied {
		if w := call(a, c.method, c.path, provider, "provider-deny-check-key", c.body); w.Code != 403 {
			t.Fatal("cross-provider access allowed", c.method, c.path, w.Code, w.Body.String())
		}
	}
	own := providerCode(t, a, "GET", s1, "member", admin)
	if sub := providerCode(t, a, "GET", child, "member", admin); sub.Code == own.Code {
		t.Fatal("child shares the provider's code")
	}
	if w := call(a, "GET", "/api/admin/partners/"+child, provider, "", nil); w.Code != 200 {
		t.Fatal("own child overview denied", w.Code, w.Body.String())
	}
	if w := call(a, "PUT", "/api/admin/partners/"+child, provider, "", map[string]any{"version": 1, "data": map[string]any{"name": "S1-child", "status": "active", "retailPer100Fen": 99999, "childMarginBps": 5000}}); w.Code != 403 {
		t.Fatal("descendant priced above its provider", w.Code, w.Body.String())
	}
	accounts := call(a, "GET", "/api/admin/accounts", admin, "", nil)
	if accounts.Code != 200 || !strings.Contains(accounts.Body.String(), "s1-login") || strings.Contains(accounts.Body.String(), "passwordHash") {
		t.Fatal("platform list must include the provider login without its password hash", accounts.Code)
	}
	if w := call(a, "PUT", "/api/admin/accounts/"+adminID("s1-login"), admin, "", map[string]any{"version": 1, "name": "x", "role": "operator"}); w.Code != 400 {
		t.Fatal("provider login bypassed the scoped account endpoint", w.Code)
	}
}
