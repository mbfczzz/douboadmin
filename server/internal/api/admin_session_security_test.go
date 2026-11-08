package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/settings"
	"encoding/json"
	"strings"
	"testing"
)

func secondaryAdmin(t *testing.T, a *Server, admin string) (string, string) {
	t.Helper()
	w := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{
		"username": "secondary", "password": "secondary-fixture-password", "name": "Secondary", "role": "super_admin",
	})
	var created core.Record
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &created) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "secondary", "password": "secondary-fixture-password"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	return created.ID, w.Result().Cookies()[0].Value
}

func TestAdminDemotionAppliesToExistingSessions(t *testing.T) {
	a, admin, _ := integrationAdmin(t)
	id, token := secondaryAdmin(t, a, admin)
	row, err := a.Store.Get(t.Context(), "admin_accounts", id)
	if err != nil {
		t.Fatal(err)
	}
	w := call(a, "PUT", "/api/admin/accounts/"+id, admin, "", map[string]any{
		"version": row.Version, "name": "Secondary", "role": "operator", "disabled": false,
	})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "GET", "/api/admin/integrations", token, "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"canManage":false`) || strings.Contains(w.Body.String(), "fields") {
		t.Fatal("demoted session can still read credentials", w.Code, w.Body.String())
	}
	w = call(a, "PUT", "/api/admin/integrations/relay", token, "", settings.Update{Values: settings.Values{"RELAY_API_KEY": "fixture"}})
	if w.Code != 403 {
		t.Fatal("demoted session still has super administrator write access", w.Code)
	}
}

func TestPasswordResetRevokesExistingAdminSessions(t *testing.T) {
	a, admin, _ := integrationAdmin(t)
	id, token := secondaryAdmin(t, a, admin)
	row, err := a.Store.Get(t.Context(), "admin_accounts", id)
	if err != nil {
		t.Fatal(err)
	}
	var previous core.AdminAccount
	if err = json.Unmarshal(row.Data, &previous); err != nil {
		t.Fatal(err)
	}
	w := call(a, "PUT", "/api/admin/accounts/"+id+"/password", admin, "", map[string]any{
		"version": row.Version, "password": "replacement-fixture-password",
	})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/admin/integrations", "/api/admin/platform"} {
		if w = call(a, "GET", path, token, "", nil); w.Code != 401 {
			t.Fatal("session issued before a password reset remained valid", w.Code, w.Body.String())
		}
	}
	// Verification can finish before a concurrent reset, but session creation after it.
	late, err := a.Sessions.CreateAdmin(t.Context(), id, "secondary", "super_admin", previous.PasswordChangedAt)
	if err != nil {
		t.Fatal(err)
	}
	if w = call(a, "GET", "/api/admin/integrations", late, "", nil); w.Code != 401 {
		t.Fatal("a late session using pre-reset credentials was accepted", w.Code)
	}
	w = call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "secondary", "password": "replacement-fixture-password"})
	if w.Code != 200 {
		t.Fatal("new credentials cannot log in", w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/admin/integrations", w.Result().Cookies()[0].Value, "", nil); w.Code != 200 {
		t.Fatal("new session incorrectly rejected", w.Code, w.Body.String())
	}
}
