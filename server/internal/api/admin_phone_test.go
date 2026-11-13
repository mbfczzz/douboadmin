package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestAdminPhoneEditAndLinkedUserChangeCannotDuplicate(t *testing.T) {
	a, _, _ := setup(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	w := call(a, "POST", "/api/admin/accounts", super, "", map[string]string{"username": "phone-owner", "password": "Tester12", "name": "号码用户", "role": "operator", "phone": "13900139000"})
	var linked core.Record
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &linked) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	var account core.AdminAccount
	json.Unmarshal(linked.Data, &account)
	// A legacy, unlinked backend account must also reserve its phone.
	legacy := core.AdminAccount{Username: "legacy-phone", Name: "旧账号", Role: "operator", Phone: "13900139001"}
	old, e := a.Store.Put(t.Context(), "admin_accounts", core.Record{ID: "legacy-phone", Data: core.Data(legacy)}, 0)
	if e != nil {
		t.Fatal(e)
	}
	w = call(a, "PUT", "/api/admin/accounts/legacy-phone", super, "", map[string]any{"version": old.Version, "name": "旧账号", "role": "operator", "phone": "13900139000"})
	if w.Code != 409 || !strings.Contains(w.Body.String(), "手机号") {
		t.Fatal(w.Code, w.Body.String())
	}
	user, _ := a.Store.Get(t.Context(), "users", account.UserID)
	body := map[string]any{"version": user.Version, "nickname": "用户", "name": "用户", "phone": "13900139001"}
	w = call(a, "PUT", "/api/admin/users/"+user.ID, super, "", body)
	if w.Code != 409 {
		t.Fatal("linked collision accepted", w.Code, w.Body.String())
	}
	after, _ := a.Store.Get(t.Context(), "users", user.ID)
	if after.Version != user.Version {
		t.Fatal("partial user update")
	}
	body["phone"] = "13900139002"
	w = call(a, "PUT", "/api/admin/users/"+user.ID, super, "", body)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	admin, _ := a.Store.Get(t.Context(), "admin_accounts", linked.ID)
	json.Unmarshal(admin.Data, &account)
	if account.Phone != "13900139002" {
		t.Fatal("persisted admin phone not updated")
	}
	// Creation must not bypass the reservation held by an unlinked account.
	w = call(a, "POST", "/api/admin/accounts", super, "", map[string]string{"username": "duplicate", "password": "Tester12", "name": "重复", "role": "operator", "phone": "13900139001"})
	if w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
}
