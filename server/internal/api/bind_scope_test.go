package api

import "testing"

// A provider's bind code links its own owner, so the provider's login can
// neither read it nor unbind; its parent and the platform can.
func TestBindCodeBelongsToTheProvidersAbove(t *testing.T) {
	a, _, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createBranch(t, a, admin, "bind-scope")
	s1 := createProvider(t, a, admin, "bind-s1", branch, "S1", "s1", map[string]string{"username": "bind-s1", "password": "Tt707b14"})
	self := adminLoginToken(t, a, "bind-s1", "Tt707b14")
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/admin/partners/" + s1 + "/codes/bind"},
		{"POST", "/api/admin/partners/" + s1 + "/codes/bind"},
		{"DELETE", "/api/admin/partners/" + s1 + "/codes/bind"},
	} {
		if w := call(a, c.method, c.path, self, "", nil); w.Code != 403 {
			t.Fatal("a provider reached its own bind code", c.method, w.Code, w.Body.String())
		}
	}
	// Its other codes stay its own to share.
	if w := call(a, "GET", "/api/admin/partners/"+s1+"/codes/member", self, "", nil); w.Code != 403 {
		t.Fatal("provider reached invite management", w.Code)
	}
	providerCode(t, a, "GET", s1, "bind", admin)
}
