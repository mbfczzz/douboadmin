package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestSuperAdminLinksExistingUserWithoutChangingBusiness(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	a.Store.Put(t.Context(), "users", core.Record{ID: "phone-user", Owner: "phone-user", Data: core.Data(map[string]string{"name": "用户", "phone": "13900139000", "verifiedPhone": "13900139000", "source": "miniprogram"})}, 0)
	a.Store.Put(t.Context(), "wallets", core.Record{ID: "phone-user", Owner: "phone-user", Data: core.Data(map[string]any{"availableUnits": 4321})}, 0)
	w := call(a, "POST", "/api/admin/accounts", admin, "", map[string]string{"username": "linked-operator", "password": "Tester12", "name": "运营", "role": "operator"})
	var row core.Record
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	path := "/api/admin/accounts/" + row.ID + "/user"
	body := map[string]any{"phone": "13900139000", "version": row.Version}
	operator := adminLoginToken(t, a, "linked-operator", "Tester12")
	if call(a, "PUT", path, operator, "", body).Code != 403 {
		t.Fatal("operator linked itself")
	}
	w = call(a, "PUT", path, admin, "", body)
	if w.Code != 200 || strings.Contains(w.Body.String(), "passwordHash") {
		t.Fatal(w.Code, w.Body.String())
	}
	json.Unmarshal(w.Body.Bytes(), &row)
	var account core.AdminAccount
	json.Unmarshal(row.Data, &account)
	if account.UserID != "phone-user" || account.Role != "operator" {
		t.Fatal(account.UserID, account.Role)
	}
	wallet, _ := a.Store.Get(t.Context(), "wallets", "phone-user")
	if wallet.Version != 1 || !strings.Contains(string(wallet.Data), "4321") {
		t.Fatal("wallet altered")
	}
	body["version"] = row.Version
	body["phone"] = "13900139001"
	if call(a, "PUT", path, admin, "", body).Code != 409 {
		t.Fatal("identity switched")
	}
	if call(a, "GET", "/api/admin/users", operator, "", nil).Code != 403 {
		t.Fatal("link elevated access")
	}
}

func TestProvisionedUserRequiresSMSAndCannotLinkTwoBackendAccounts(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	var first core.Record
	for _, name := range []string{"account-one", "account-two"} {
		w := call(a, "POST", "/api/admin/accounts", admin, "", map[string]string{"username": name, "password": "Tester12", "name": name, "role": "operator"})
		var row core.Record
		if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		w = call(a, "PUT", "/api/admin/accounts/"+row.ID+"/user", admin, "", map[string]any{"phone": "13900139000", "version": row.Version})
		if name == "account-one" {
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			json.Unmarshal(w.Body.Bytes(), &first)
		} else if w.Code != 409 {
			t.Fatal("two backend credentials linked", w.Code, w.Body.String())
		}
	}
	var account core.AdminAccount
	json.Unmarshal(first.Data, &account)
	row, _ := a.Store.Get(t.Context(), "users", account.UserID)
	if strings.Contains(string(row.Data), "verifiedPhone") {
		t.Fatal("admin provision fabricated phone verification")
	}
	body := loginChallenge(t, a, "13900139000", "app")
	w := call(a, "POST", "/api/auth/phone/login", "", "", body)
	var session struct{ UserID, Token string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &session) != nil || session.UserID != account.UserID {
		t.Fatal(w.Code, w.Body.String())
	}
	if call(a, "GET", "/api/admin/me", session.Token, "", nil).Code != 403 {
		t.Fatal("SMS entered admin realm")
	}
}
