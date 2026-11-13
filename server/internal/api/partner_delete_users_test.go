package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestDeleteIncludesUniqueCurrentUsersAndRevokesAllClientSessions(t *testing.T) {
	a, _, super := activationFixture(t)
	branch := createBranch(t, a, super, "delete-users")
	child := createProvider(t, a, super, "delete-users-child", branch, "下级", "s1", nil)
	other := createBranch(t, a, super, "keep-users")
	for user, partner := range map[string]string{"user-a": branch, "owner": child, "outside": other, "former": other} {
		if user != "user-a" {
			newMiniUser(t, a, user)
		}
		_, e := a.Store.Put(t.Context(), "memberships", core.Record{ID: user, Owner: user, Data: core.Data(core.Membership{PartnerID: partner, Status: "active"})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	a.Store.Put(t.Context(), "partner_owners", core.Record{ID: "owner", Data: core.Data(core.PartnerOwner{PartnerID: child, Status: "active"})}, 0)
	// A historical approved registration is not current ownership.
	a.Store.Put(t.Context(), "registrations", core.Record{ID: "former", Data: core.Data(core.Registration{PartnerID: branch, Status: "approved"})}, 0)
	first, _ := a.Sessions.Create(t.Context(), "user-a", "user")
	second, _ := a.Sessions.Create(t.Context(), "user-a", "user")
	profile, _ := a.Store.Get(t.Context(), "users", "user-a")
	var p map[string]any
	json.Unmarshal(profile.Data, &p)
	phone, _ := p["phone"].(string)
	a.Store.Put(t.Context(), "phone_owners", core.Record{ID: phone, Data: core.Data(phoneOwner{User: "user-a"})}, 0)
	wallet, _ := a.Store.Put(t.Context(), "wallets", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(core.Wallet{UserID: "user-a", Available: 777})}, 0)
	preview := deletionPreview(t, a, super, branch)
	if preview.Users != 2 {
		t.Fatal("users must be deduplicated and exclude old registrations", preview)
	}
	w := call(a, "DELETE", "/api/admin/partners/"+branch, super, "", map[string]string{"confirm": "delete-users", "token": preview.Token, "reason": "删除组织和用户"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, token := range []string{first, second} {
		if w = call(a, "GET", "/api/me", token, "", nil); w.Code != 403 {
			t.Fatal("old session accepted", w.Code)
		}
	}
	for _, user := range []string{"user-a", "owner"} {
		_, data, e := recordOf[map[string]any](t.Context(), a.Store, "users", user)
		if e != nil || data["archived"] != true || data["disabled"] != true {
			t.Fatal("user not deleted", user, e)
		}
	}
	for _, user := range []string{"outside", "former"} {
		_, data, _ := recordOf[map[string]any](t.Context(), a.Store, "users", user)
		if data["archived"] == true {
			t.Fatal("unrelated user deleted", user)
		}
	}
	_, reservation, _ := recordOf[phoneOwner](t.Context(), a.Store, "phone_owners", phone)
	if reservation.User != "" {
		t.Fatal("phone not released")
	}
	after, _ := a.Store.Get(t.Context(), "wallets", "user-a")
	if after.Version != wallet.Version || string(after.Data) != string(wallet.Data) {
		t.Fatal("wallet history changed")
	}
	list := call(a, "GET", "/api/admin/users", super, "", nil)
	if list.Code != 200 || strings.Contains(list.Body.String(), `"id":"user-a"`) {
		t.Fatal("deleted user still in active list")
	}
}

func TestDeleteUserChangesInvalidateConfirmationAndFailuresRollback(t *testing.T) {
	a, _, super := activationFixture(t)
	branch := createBranch(t, a, super, "delete-user-race")
	a.Store.Put(t.Context(), "memberships", core.Record{ID: "user-a", Data: core.Data(core.Membership{PartnerID: branch, Status: "active"})}, 0)
	before := deletionPreview(t, a, super, branch)
	legacy := call(a, "DELETE", "/api/admin/partners/"+branch, super, "", map[string]string{"token": before.Token, "reason": "旧页面未确认用户"})
	if legacy.Code != 400 || !strings.Contains(legacy.Body.String(), "勾选确认") {
		t.Fatal("old UI deleted users without confirmation", legacy.Code)
	}
	row, _ := a.Store.Get(t.Context(), "users", "user-a")
	row, _ = a.Store.Put(t.Context(), "users", row, row.Version)
	body := map[string]string{"confirm": "delete-users", "token": before.Token, "reason": "确认删除用户"}
	if w := call(a, "DELETE", "/api/admin/partners/"+branch, super, "", body); w.Code != 409 {
		t.Fatal("stale user snapshot accepted", w.Code)
	}
	latest := deletionPreview(t, a, super, branch)
	body["token"] = latest.Token
	a.Partners.Store = deletionFaultStore{Store: a.Store, fail: true}
	if w := call(a, "DELETE", "/api/admin/partners/"+branch, super, "", body); w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
	after, _ := a.Store.Get(t.Context(), "users", "user-a")
	if after.Version != row.Version || string(after.Data) != string(row.Data) {
		t.Fatal("partial user archive persisted")
	}
}

func TestDeleteRefusesUsersWithOutsideBackendAuthority(t *testing.T) {
	a, _, super := activationFixture(t)
	branch := createBranch(t, a, super, "cross-user-authority")
	a.Store.Put(t.Context(), "memberships", core.Record{ID: "user-a", Data: core.Data(core.Membership{PartnerID: branch, Status: "active"})}, 0)
	a.Store.Put(t.Context(), "admin_accounts", core.Record{ID: "external-admin", Data: core.Data(core.AdminAccount{UserID: "user-a", Role: "operator"})}, 0)
	w := call(a, "GET", "/api/admin/partners/"+branch+"/delete-preview", super, "", nil)
	if w.Code != 400 || !strings.Contains(w.Body.String(), "核对归属") {
		t.Fatal(w.Code, w.Body.String())
	}
}
