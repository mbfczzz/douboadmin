package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestSelectedProviderAccountReadsAndUpdatesOnlyTheRequestedLogin(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	partner := createProvider(t, a, admin, "multi-provider", "root", "多账号服务商", "branch", map[string]string{"username": "first-login", "password": "first-login-password-2026"})
	first, err := a.Store.Get(t.Context(), "admin_accounts", adminID("first-login"))
	if err != nil {
		t.Fatal(err)
	}
	hash, err := hashPassword("second-login-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	second, err := a.createProviderAccount(t.Context(), partner, "备用账号", hash, providerAccountInput{Username: "second-login", Role: "branch"}, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/admin/partners/" + partner + "/account"
	w := call(a, "GET", path+"?accountId="+first.ID, admin, "", nil)
	var view struct {
		Account core.Record `json:"account"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &view) != nil || view.Account.ID != first.ID {
		t.Fatal("clicked login was replaced by the provider's newer login", w.Code)
	}
	w = call(a, "PUT", path, admin, "", map[string]any{"accountId": first.ID, "version": first.Version, "role": "branch", "disabled": true})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	updated, _ := a.Store.Get(t.Context(), "admin_accounts", first.ID)
	untouched, _ := a.Store.Get(t.Context(), "admin_accounts", second.ID)
	var disabled core.AdminAccount
	_ = json.Unmarshal(updated.Data, &disabled)
	if !disabled.Disabled || updated.Version != first.Version+1 || untouched.Version != second.Version || string(untouched.Data) != string(second.Data) {
		t.Fatal("provider account change affected another login")
	}
	// A conflict must not switch to another login or create a new one.
	if w = call(a, "PUT", path, admin, "", map[string]any{"accountId": first.ID, "version": first.Version, "role": "branch"}); w.Code != 409 {
		t.Fatal("selected login bypassed its version check", w.Code)
	}
	for _, id := range []string{adminID("admin"), "missing-login"} {
		if w = call(a, "GET", path+"?accountId="+id, admin, "", nil); w.Code != 404 {
			t.Fatal("unrelated selected login was returned", w.Code)
		}
		if w = call(a, "PUT", path, admin, "", map[string]any{"accountId": id, "version": 0, "role": "branch", "username": "must-not-create", "password": "must-not-create-password"}); w.Code != 404 {
			t.Fatal("missing selected login became an account creation", w.Code)
		}
	}
	if _, err := a.Store.Get(t.Context(), "admin_accounts", adminID("must-not-create")); err == nil {
		t.Fatal("target selection created an unrelated account")
	}
}
