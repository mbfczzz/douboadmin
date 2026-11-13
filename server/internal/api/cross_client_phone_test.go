package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"sync"
	"testing"
)

func TestConcurrentMiniAndAppLoginUseOneUser(t *testing.T) {
	for range 8 {
		a, _ := phoneLoginFixture(t)
		body := loginChallenge(t, a, "13900139000", "app")
		ids := make(chan string, 2)
		var wg sync.WaitGroup
		for _, client := range []string{"miniprogram", "app"} {
			wg.Add(1)
			go func(client string) {
				defer wg.Done()
				path := "/api/auth/phone/login"
				input := body
				if client == "miniprogram" {
					path = "/api/auth/wechat"
					input = map[string]string{"code": "fresh-code", "phoneCode": "phone-proof"}
				}
				w := call(a, "POST", path, "", "", input)
				var session struct{ UserID string }
				if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &session) != nil {
					t.Error(client, w.Code, w.Body.String())
					return
				}
				ids <- session.UserID
			}(client)
		}
		wg.Wait()
		close(ids)
		first := ""
		count := 0
		for id := range ids {
			count++
			if first == "" {
				first = id
			}
			if first != id {
				t.Fatal("cross-client duplicate identity", first, id)
			}
		}
		if count != 2 {
			t.Fatal("both logins must succeed")
		}
		page, e := a.Store.RecordPage(t.Context(), core.RecordQuery{Namespace: "users", Fields: map[string]string{"phone": "13900139000"}, Page: 1, Size: 10})
		if e != nil || page.Total != 1 {
			t.Fatal("duplicate phone rows", page.Total, e)
		}
	}
}

func TestDisabledPhoneCannotCreateAnotherClientAccount(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "proof"})
	var session struct{ UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &session) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	user, _ := a.Store.Get(t.Context(), "users", session.UserID)
	w = call(a, "PUT", "/api/admin/users/"+user.ID+"/status", admin, "", map[string]any{"version": user.Version, "disabled": true, "reason": "测试停用账号"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, source := range []string{"app", "other"} {
		a.Sessions.limits = map[string]bucket{}
		body := loginChallenge(t, a, "13900139000", source)
		if w = call(a, "POST", "/api/auth/phone/login", "", "", body); w.Code != 403 {
			t.Fatal("disabled phone was reused", source, w.Code, w.Body.String())
		}
	}
	owner, _, e := recordOf[phoneOwner](t.Context(), a.Store, "phone_owners", "13900139000")
	if e != nil || owner.ID == "" {
		t.Fatal("phone reservation lost", e)
	}
	page, e := a.Store.RecordPage(t.Context(), core.RecordQuery{Namespace: "users", Fields: map[string]string{"phone": "13900139000"}, Page: 1, Size: 10})
	if e != nil || page.Total != 1 {
		t.Fatal("duplicate phone rows", page.Total, e)
	}
}
