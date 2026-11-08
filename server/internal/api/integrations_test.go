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

func TestNewPurchaseWaitsForPaymentSettingsRestart(t *testing.T) {
	a, _, _ := integrationAdmin(t)
	if err := a.Integrations.Save(t.Context(), "wechat", "admin", settings.Update{Values: settings.Values{"WECHAT_APP_SECRET": "fixture-updated-secret"}}, false); err != nil {
		t.Fatal(err)
	}
	goods := core.VirtualOrder{ProductID: "pack", PointsUnits: 1000000, Env: 0}
	_, err := a.Billing.CreateVirtualOrder(t.Context(), "user-a", "pending-settings", 10, core.DefaultPlatform(), "app", "offer", "openid", "", goods)
	if err == nil || !strings.Contains(err.Error(), "重启") {
		t.Fatal("pending payment settings admitted purchase", err)
	}
	orders, _ := a.Store.List(t.Context(), "orders", "")
	if len(orders) != 0 {
		t.Fatal("pending purchase persisted")
	}
	if _, err = a.Integrations.LoadStartup(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Billing.CreateVirtualOrder(t.Context(), "user-a", "pending-settings", 10, core.DefaultPlatform(), "app", "offer", "openid", "", goods); err != nil {
		t.Fatal("applied payment settings blocked purchase", err)
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

func TestIntegrationSaveExplainsKeyFileFailureWithoutExposingSecrets(t *testing.T) {
	a, admin, _ := integrationAdmin(t)
	// A directory cannot be read as a key file on either Windows or Linux.
	a.Integrations.KeyPath = t.TempDir()
	w := call(a, "PUT", "/api/admin/integrations/relay", admin, "", settings.Update{
		Values: settings.Values{"RELAY_API_KEY": "submitted-private-fixture"},
	})
	if w.Code != 503 || !strings.Contains(w.Body.String(), "INTEGRATION_KEY_UNAVAILABLE") || !strings.Contains(w.Body.String(), "ReadWritePaths") {
		t.Fatal("key file failure became a generic service error", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "submitted-private-fixture") || strings.Contains(w.Body.String(), a.Integrations.KeyPath) {
		t.Fatal("key file failure exposed private input or an OS path")
	}
	if rows, err := a.Store.List(t.Context(), "integration_audit", ""); err != nil || len(rows) != 0 {
		t.Fatal("failed save wrote an audit or configuration", err)
	}
}
