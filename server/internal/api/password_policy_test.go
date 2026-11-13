package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"golang.org/x/crypto/bcrypt"
	"testing"
)

func TestLegacyPasswordLoginCanUpgradeToNewPolicy(t *testing.T) {
	a, _, _ := setup(t)
	adminLoginToken(t, a, "admin", "Tt661ea2")
	row, err := a.Store.Get(t.Context(), "admin_accounts", adminID("admin"))
	if err != nil {
		t.Fatal(err)
	}
	var account core.AdminAccount
	_ = json.Unmarshal(row.Data, &account)
	const legacy = "old-account-long-password!"
	hash, _ := bcrypt.GenerateFromPassword([]byte(legacy), bcrypt.MinCost)
	account.PasswordHash = string(hash)
	row.Data = core.Data(account)
	if _, err = a.Store.Put(t.Context(), "admin_accounts", row, row.Version); err != nil {
		t.Fatal(err)
	}
	token := adminLoginToken(t, a, "admin", legacy)
	changed := call(a, "PUT", "/api/admin/me/password", token, "", map[string]string{"current": legacy, "next": "Changed8"})
	if changed.Code != 200 {
		t.Fatal(changed.Code, changed.Body.String())
	}
	adminLoginToken(t, a, "admin", "Changed8")
}
func TestBootstrapCannotCreateAnOutOfPolicyPassword(t *testing.T) {
	a, _, _ := setup(t)
	a.Config.AdminPassword = "old-bootstrap-long-password"
	result := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": a.Config.AdminPassword})
	if result.Code != 401 {
		t.Fatal(result.Code)
	}
	if _, err := a.Store.Get(t.Context(), "admin_accounts", adminID("admin")); err == nil {
		t.Fatal("invalid bootstrap account created")
	}
}
