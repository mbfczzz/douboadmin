package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"sync"
	"testing"
)

func TestDeletedWeChatUserCanRegisterFreshWithoutInheritingData(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	input := map[string]string{"code": "wx-code", "phoneCode": "phone-code"}
	w := call(a, "POST", "/api/auth/wechat", "", "", input)
	var old struct{ Token, UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &old) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	wallet := core.Wallet{UserID: old.UserID, Available: 123400}
	a.Store.Put(t.Context(), "wallets", core.Record{ID: old.UserID, Owner: old.UserID, Data: core.Data(wallet)}, 0)
	profile, _ := a.Store.Get(t.Context(), "users", old.UserID)
	w = call(a, "DELETE", "/api/admin/users/"+old.UserID, super, "", map[string]any{"version": profile.Version, "reason": "测试重新注册"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/access", old.Token, "", nil); w.Code != 403 || !strings.Contains(w.Body.String(), "ACCOUNT_DELETED") {
		t.Fatal(w.Code, w.Body.String())
	}
	// Concurrent re-registration shares one new identity, never reactivates old ID.
	var wg sync.WaitGroup
	ids := make(chan string, 4)
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := call(a, "POST", "/api/auth/wechat", "", "", input)
			var next struct{ Token, UserID string }
			if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &next) != nil {
				t.Error(w.Code, w.Body.String())
				return
			}
			ids <- next.UserID
		}()
	}
	wg.Wait()
	close(ids)
	fresh := ""
	count := 0
	for id := range ids {
		count++
		if fresh == "" {
			fresh = id
		}
		if id == old.UserID || id != fresh {
			t.Fatal("wrong re-registration identity")
		}
	}
	if count != 4 {
		t.Fatal("login failed")
	}
	_, archived, _ := recordOf[map[string]any](t.Context(), a.Store, "users", old.UserID)
	if archived["archived"] != true {
		t.Fatal("old account revived")
	}
	stored, _ := a.Store.Get(t.Context(), "wallets", old.UserID)
	var oldWallet core.Wallet
	json.Unmarshal(stored.Data, &oldWallet)
	if oldWallet != wallet {
		t.Fatal("historical wallet changed")
	}
	if _, e := a.Store.Get(t.Context(), "partner_owners", fresh); e == nil {
		t.Fatal("new user inherited role")
	}
	if _, e := a.Store.Get(t.Context(), "wallets", fresh); e == nil {
		t.Fatal("new user inherited wallet")
	}
}

func TestDisabledWeChatAccountCannotRegisterAroundSuspension(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	input := map[string]string{"code": "wx-code", "phoneCode": "proof"}
	w := call(a, "POST", "/api/auth/wechat", "", "", input)
	var session struct{ Token, UserID string }
	json.Unmarshal(w.Body.Bytes(), &session)
	profile, _ := a.Store.Get(t.Context(), "users", session.UserID)
	w = call(a, "PUT", "/api/admin/users/"+session.UserID+"/status", super, "", map[string]any{"version": profile.Version, "disabled": true, "reason": "测试停用用户"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, w := range []struct {
		method, path, token string
		body                any
	}{{"GET", "/api/access", session.Token, nil}, {"POST", "/api/auth/wechat", "", input}} {
		result := call(a, w.method, w.path, w.token, "", w.body)
		if result.Code != 403 || !strings.Contains(result.Body.String(), "ACCOUNT_DISABLED") {
			t.Fatal(result.Code, result.Body.String())
		}
	}
	rows, _ := a.Store.RecordPage(t.Context(), core.RecordQuery{Namespace: "users", Fields: map[string]string{"phone": "13900139000"}, Page: 1, Size: 10})
	if rows.Total != 1 {
		t.Fatal("suspension bypassed by duplicate identity")
	}
}
