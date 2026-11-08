package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/settings"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func integrationAdmin(t *testing.T) (*Server, string, string) {
	t.Helper()
	a, user, _ := setup(t)
	a.Integrations = settings.New(a.Store, filepath.Join(a.Config.MediaDir, ".secrets", "integrations.key"), nil)
	if _, err := a.Integrations.LoadStartup(t.Context()); err != nil {
		t.Fatal(err)
	}
	w := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "test-pass"})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	return a, w.Result().Cookies()[0].Value, user
}

func TestIntegrationAPIRejectsUsersAndOperators(t *testing.T) {
	a, admin, user := integrationAdmin(t)
	if w := call(a, "GET", "/api/admin/integrations", user, "", nil); w.Code != 403 {
		t.Fatal("user can read integration settings", w.Code)
	}
	created := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{
		"username": "operator", "password": "operator-password-fixture", "name": "Operator", "role": "operator",
	})
	if created.Code != 201 {
		t.Fatal(created.Code, created.Body.String())
	}
	login := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "operator", "password": "operator-password-fixture"})
	operator := login.Result().Cookies()[0].Value
	if w := call(a, "GET", "/api/admin/integrations", operator, "", nil); w.Code != 200 || strings.Contains(w.Body.String(), "fields") || !strings.Contains(w.Body.String(), `"canManage":false`) {
		t.Fatal("operator sees protected configuration", w.Code, w.Body.String())
	}
	input := settings.Update{Values: settings.Values{"RELAY_API_KEY": "fixture-private-key"}}
	for _, token := range []string{user, operator} {
		if w := call(a, "PUT", "/api/admin/integrations/relay", token, "", input); w.Code != 403 {
			t.Fatal("non-super administrator can write configuration", w.Code)
		}
	}
}

func TestIntegrationAPIShowsSecretsOnlyToSuperAdmins(t *testing.T) {
	a, admin, user := integrationAdmin(t)
	input := settings.Update{Values: settings.Values{"RELAY_API_KEY": "fixture-private-key"}}
	w := call(a, "PUT", "/api/admin/integrations/relay", admin, "", input)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "fixture-private-key") || !strings.Contains(w.Body.String(), `"pendingRestart":true`) {
		t.Fatal("super administrator should see the configured secret", w.Code, w.Body.String())
	}
	if w := call(a, "GET", "/api/admin/integrations", user, "", nil); strings.Contains(w.Body.String(), "fixture-private-key") {
		t.Fatal("non-administrator can read a configured secret", w.Code)
	}
	if w = call(a, "PUT", "/api/admin/integrations/relay", admin, "", input); w.Code != 409 {
		t.Fatal("stale version overwrite accepted", w.Code)
	}
	input = settings.Update{Version: 1, Values: settings.Values{"RELAY_BASE_URL": "invalid-address"}}
	if w = call(a, "PUT", "/api/admin/integrations/relay", admin, "", input); w.Code != 400 || !strings.Contains(w.Body.String(), `"field":"RELAY_BASE_URL"`) {
		t.Fatal("field validation response missing", w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/media/.secrets/integrations.key", "", "", nil); w.Code != 404 {
		t.Fatal("encryption key is reachable via media endpoint", w.Code)
	}
	if err := os.Remove(a.Integrations.KeyPath); err != nil {
		t.Fatal(err)
	}
	a.Integrations = settings.New(a.Store, a.Integrations.KeyPath, nil)
	if w = call(a, "GET", "/api/admin/integrations", admin, "", nil); w.Code != 503 || strings.Contains(w.Body.String(), "fixture-private-key") {
		t.Fatal("missing key did not fail closed", w.Code)
	}
}

func TestRechargeCannotEnableBeforeSavedPaymentSettingsAreApplied(t *testing.T) {
	a, admin, _ := integrationAdmin(t)
	if err := a.Integrations.Save(t.Context(), "wechat", "admin", settings.Update{Values: settings.Values{"WECHAT_APP_ID": "wx0000000000000001"}}, false); err != nil {
		t.Fatal(err)
	}
	platform := core.DefaultPlatform()
	platform.RechargeEnabled = true
	w := call(a, "PUT", "/api/admin/platform", admin, "", map[string]any{"version": 0, "data": platform})
	if w.Code != 409 || !strings.Contains(w.Body.String(), "重启") {
		t.Fatal("pending payment configuration admitted new purchases", w.Code, w.Body.String())
	}
	platform.RechargeEnabled = false
	if w = call(a, "PUT", "/api/admin/platform", admin, "", map[string]any{"version": 0, "data": platform}); w.Code != 200 {
		t.Fatal("pending settings prevented disabling purchases", w.Code, w.Body.String())
	}
}

func TestProductionWithoutOSSAllowsAdminConfigurationButBlocksMedia(t *testing.T) {
	a, admin, user := integrationAdmin(t)
	a.Config.Production = true
	if w := call(a, "GET", "/api/admin/integrations", admin, "", nil); w.Code != 200 {
		t.Fatal("unconfigured services block admin setup", w.Code)
	}
	if w := call(a, "POST", "/api/admin/assets?purpose=cover", admin, "", nil); w.Code != 503 || !strings.Contains(w.Body.String(), "OSS") {
		t.Fatal("production silently accepts local uploads", w.Code, w.Body.String())
	}
	input := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "test", Resolution: "1K", Ratio: "1:1"}
	if w := call(a, "POST", "/api/jobs", user, "missing-oss-test", input); w.Code != 400 || !strings.Contains(w.Body.String(), "OSS") {
		t.Fatal("production media task starts before storage configuration", w.Code, w.Body.String())
	}
}
