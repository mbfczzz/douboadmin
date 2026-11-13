package api

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"doubo/server/internal/core"
	"doubo/server/internal/settings"
)

func providerPasswordView(t *testing.T, a *Server, partner, token string) (core.Record, string) {
	t.Helper()
	w := call(a, "GET", "/api/admin/partners/"+partner+"/account", token, "", nil)
	var out struct {
		Account  core.Record
		Password string
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
		t.Fatal("cannot read provider account", w.Code)
	}
	if strings.Contains(w.Body.String(), "passwordHash") || strings.Contains(w.Body.String(), "sealed") {
		t.Fatal("credential internals exposed")
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("password response may be cached")
	}
	return out.Account, out.Password
}

func TestProviderPasswordViewCreationResetAndConflict(t *testing.T) {
	a, _, _ := setup(t)
	a.Integrations = settings.New(a.Store, filepath.Join(t.TempDir(), "key"), nil)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	const original, next = "Tt079f2a", "Tta548a2"
	id := createProvider(t, a, admin, "password-view", "root", "分公司", "branch", map[string]string{"username": "password-view", "password": original})
	row, password := providerPasswordView(t, a, id, admin)
	if password != original {
		t.Fatal("created provider password is unavailable")
	}
	stored, err := a.Store.Get(t.Context(), "provider_logins", "admin:"+id)
	if err != nil || stored.Owner != id || strings.Contains(string(stored.Data), original) {
		t.Fatal("password must be encrypted at rest", err)
	}
	// Status/role changes preserve the password and the account version rules.
	path := "/api/admin/partners/" + id + "/account"
	w := call(a, "PUT", path, admin, "", map[string]any{"version": row.Version, "role": "partner", "disabled": true})
	if w.Code != 200 {
		t.Fatal("status change failed", w.Code)
	}
	row, password = providerPasswordView(t, a, id, admin)
	if password != original {
		t.Fatal("status change lost the password")
	}
	w = call(a, "PUT", path, admin, "", map[string]any{"version": row.Version, "password": next})
	if w.Code != 200 || strings.Contains(w.Body.String(), next) {
		t.Fatal("reset failed or leaked its password in a write response", w.Code)
	}
	// A conflicting reset must not replace the successfully stored secret.
	w = call(a, "PUT", path, admin, "", map[string]any{"version": row.Version, "password": "Conflict"})
	if w.Code != 409 {
		t.Fatal("stale reset accepted", w.Code)
	}
	_, password = providerPasswordView(t, a, id, admin)
	if password != next {
		t.Fatal("current password not shown after reset conflict")
	}
	adminLoginToken(t, a, "password-view", next)
	if w = call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "password-view", "password": original}); w.Code != 401 {
		t.Fatal("old password still accepted", w.Code)
	}
}

func TestProviderPasswordViewLegacyAccountAndSelfChange(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	id := createProvider(t, a, admin, "legacy-password", "root", "历史分公司", "branch", map[string]string{"username": "legacy-password", "password": "Tt756879"})
	a.Integrations = settings.New(a.Store, filepath.Join(t.TempDir(), "key"), nil)
	row, password := providerPasswordView(t, a, id, admin)
	if password != "" {
		t.Fatal("a legacy hash was presented as a password")
	}
	path := "/api/admin/partners/" + id + "/account"
	if w := call(a, "PUT", path, admin, "", map[string]any{"version": row.Version, "password": "Tt92e6af"}); w.Code != 200 {
		t.Fatal("legacy reset failed", w.Code)
	}
	_, password = providerPasswordView(t, a, id, admin)
	if password != "Tt92e6af" {
		t.Fatal("reset password unavailable")
	}
	self := adminLoginToken(t, a, "legacy-password", password)
	if w := call(a, "PUT", "/api/admin/me/password", self, "", map[string]string{"current": password, "next": "Owner123"}); w.Code != 200 {
		t.Fatal("self change failed", w.Code)
	}
	if _, password = providerPasswordView(t, a, id, admin); password != "" {
		t.Fatal("outdated password shown after a self change")
	}
}

func TestProviderPasswordViewExistingProviderOpeningAndScope(t *testing.T) {
	a, user, _ := setup(t)
	a.Integrations = settings.New(a.Store, filepath.Join(t.TempDir(), "key"), nil)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createProvider(t, a, admin, "scope-parent", "root", "分公司", "branch", map[string]string{"username": "scope-parent", "password": "Tt833d83"})
	id := createProvider(t, a, admin, "scope-child", branch, "下级", "s1", nil)
	path := "/api/admin/partners/" + id + "/account"
	if w := call(a, "PUT", path, admin, "", map[string]any{"version": 0, "username": "scope-child", "password": "Ttace72f", "role": "partner"}); w.Code != 201 {
		t.Fatal("opening account failed", w.Code)
	}
	parent := adminLoginToken(t, a, "scope-parent", "Tt833d83")
	if w := call(a, "GET", path, parent, "", nil); w.Code != 403 {
		t.Fatal("parent can read managed login", w.Code)
	}

	child := adminLoginToken(t, a, "scope-child", "Ttace72f")
	for _, check := range []struct {
		token, partner string
		status         int
	}{
		{"", id, 401}, {user, id, 403}, {child, branch, 403},
	} {
		w := call(a, "GET", "/api/admin/partners/"+check.partner+"/account", check.token, "", nil)
		if w.Code != check.status || strings.Contains(w.Body.String(), "Ttace72f") || strings.Contains(w.Body.String(), "Tt833d83") {
			t.Fatal("password exposed outside account scope", w.Code)
		}
	}
	list := call(a, "GET", "/api/admin/accounts", admin, "", nil)
	if list.Code != 200 || strings.Contains(list.Body.String(), "Ttace72f") {
		t.Fatal("password exposed in account listing")
	}
	// Wrong encryption keys never return ciphertext or an unrelated password.
	a.Integrations = settings.New(a.Store, filepath.Join(t.TempDir(), "other-key"), nil)
	if _, password := providerPasswordView(t, a, id, admin); password != "" {
		t.Fatal("password returned with the wrong encryption key")
	}
}
