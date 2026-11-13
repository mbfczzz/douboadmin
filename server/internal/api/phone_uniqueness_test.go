package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
)

func TestPhoneUniqueEvenWithVerificationDisabled(t *testing.T) {
	a, _, _ := setup(t)
	off := false
	a.Config.SMSVerificationEnabled = &off
	tokens := []string{newMiniUser(t, a, "one"), newMiniUser(t, a, "two")}
	var successes atomic.Int32
	var wg sync.WaitGroup
	for _, token := range tokens {
		wg.Add(1)
		go func(token string) {
			defer wg.Done()
			w := call(a, "POST", "/api/access/profile", token, "", map[string]string{"name": "用户", "phone": "13900139000"})
			if w.Code == 200 {
				successes.Add(1)
			} else if w.Code != 400 {
				t.Error(w.Code, w.Body.String())
			}
		}(token)
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatal("phone uniqueness failed", successes.Load())
	}
	row, _ := a.Store.Get(t.Context(), "phone_owners", "13900139000")
	var owner phoneOwner
	json.Unmarshal(row.Data, &owner)
	user, _ := a.Store.Get(t.Context(), "users", owner.User)
	var profile map[string]any
	json.Unmarshal(user.Data, &profile)
	if profile["verifiedPhone"] != nil {
		t.Fatal("reservation is not proof")
	}
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	other := "one"
	if owner.User == other {
		other = "two"
	}
	w := call(a, "PUT", "/api/admin/users/"+other, admin, "", map[string]any{"version": 1, "nickname": "用户", "name": "用户", "phone": "13900139000"})
	if w.Code != 400 {
		t.Fatal("admin edit bypassed unique phone", w.Code, w.Body.String())
	}
	users, _ := a.Store.List(t.Context(), "users", "")
	count := 0
	for _, row := range users {
		var p map[string]any
		json.Unmarshal(row.Data, &p)
		if p["phone"] == "13900139000" {
			count++
		}
	}
	if count != 1 {
		t.Fatal("duplicate persisted")
	}
}

func TestWeChatExistingIdentityConflictPreservesBothAccounts(t *testing.T) {
	a, openid := phoneLoginFixture(t)
	first := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "first", "phoneCode": "phone"})
	if first.Code != 200 {
		t.Fatal(first.Body.String())
	}
	*openid = "legacy-other"
	second := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "second"})
	var session struct{ UserID string }
	json.Unmarshal(second.Body.Bytes(), &session)
	before, _ := a.Store.Get(t.Context(), "users", session.UserID)
	a.Store.Put(t.Context(), "wallets", core.Record{ID: session.UserID, Owner: session.UserID, Data: core.Data(map[string]any{"availableUnits": 9876})}, 0)
	conflict := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "third", "phoneCode": "phone"})
	if conflict.Code != 409 {
		t.Fatal(conflict.Code, conflict.Body.String())
	}
	after, _ := a.Store.Get(t.Context(), "users", session.UserID)
	wallet, _ := a.Store.Get(t.Context(), "wallets", session.UserID)
	if before.Version != after.Version || wallet.Version != 1 {
		t.Fatal("conflict mutated user or funds")
	}
}
