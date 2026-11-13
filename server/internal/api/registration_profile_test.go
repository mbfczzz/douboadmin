package api

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestProfileRegistrationWithoutSMSAllowsProviderScan(t *testing.T) {
	for _, role := range []string{"s1", "s2"} {
		t.Run(role, func(t *testing.T) {
			a, _, _ := activationFixture(t)
			admin := adminLoginToken(t, a, "admin", "Tt661ea2")
			a.Config.DemoLogin = false // test deployment: no SMS sender or debug codes
			user := newMiniUser(t, a, "name-user")
			branch := createBranch(t, a, admin, "profile-phone")
			invite := providerCode(t, a, "GET", branch, role, admin)
			v := accessOf(t, a, user)
			if !v.ProfileRequired || v.PhoneVerificationRequired || v.Message != errBasicProfileRequired {
				t.Fatal("missing name did not show a usable registration step", v)
			}
			w := call(a, "POST", "/api/access/join", user, "", map[string]string{"code": invite.Code, "method": "scan"})
			if w.Code != 403 || !strings.Contains(w.Body.String(), "PROFILE_REQUIRED") {
				t.Fatal("nameless registration accepted", w.Code)
			}
			for _, ns := range []string{"registrations", "partner_owners"} {
				if _, e := a.Store.Get(t.Context(), ns, "name-user"); !errors.Is(e, core.ErrNotFound) {
					t.Fatal("failed scan changed state", ns, e)
				}
			}
			const phone = "13900139010"
			w = call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": " 张三 ", "phone": " " + phone + " "})
			if w.Code != 200 {
				t.Fatal("registration without SMS failed", w.Code, w.Body.String())
			}
			if v = accessOf(t, a, user); v.ProfileRequired || v.PhoneVerificationRequired || v.Active {
				t.Fatal("wrong next step", v)
			}
			if status, body := joinHTTP(a, user, invite.Code); status != 200 || !strings.Contains(body, `"status":"review"`) {
				t.Fatal(status, body)
			}
			page := registrationPage(t, a, admin, "?status=pending&q=张三")
			var reg core.Registration
			if page.Total != 1 || json.Unmarshal(page.Items[0].Data, &reg) != nil || reg.Name != "张三" || reg.Role != role || reg.ParentID != branch || reg.Phone != phone {
				t.Fatal("wrong provider registration", page)
			}
			if status, body := decideHTTP(t, a, admin, "name-user", true, ""); status != 200 {
				t.Fatal("approval failed", status, body)
			}
			if v = accessOf(t, a, user); !v.Active || v.ProfileRequired || v.PhoneVerificationRequired {
				t.Fatal("approved test account still blocked on SMS", v)
			}
			if w := call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
				t.Fatal("test account cannot use the mini-program", w.Code)
			}
			login := call(a, "POST", "/api/provider/password", user, "", nil)
			if login.Code != 403 {
				t.Fatal("mini-program opened backend login", login.Code)
			}

			row, _ := a.Store.Get(t.Context(), "users", "name-user")
			var profile map[string]any
			_ = json.Unmarshal(row.Data, &profile)
			if profile["verifiedPhone"] != nil || profile["phoneVerifiedAt"] != nil {
				t.Fatal("unverified phone gained verification")
			}
			if row, e := a.Store.Get(t.Context(), "phone_owners", phone); e != nil || !strings.Contains(string(row.Data), "name-user") {
				t.Fatal("phone uniqueness reservation missing", e)
			}
			// Once real SMS is configured, the same account must verify its phone.
			sender := &fakeSMS{}
			a.SMS = sender
			if v = accessOf(t, a, user); !v.ProfileRequired || !v.PhoneVerificationRequired || v.Active {
				t.Fatal("unverified phone bypassed newly configured SMS", v)
			}
			if w := call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "张三", "phone": phone}); w.Code != 400 {
				t.Fatal("missing code accepted after configuring SMS", w.Code)
			}
			if w := call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": phone}); w.Code != 200 {
				t.Fatal("SMS send failed", w.Code)
			}
			if w := call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "张三", "phone": phone, "code": sender.code}); w.Code != 200 {
				t.Fatal("SMS verification failed", w.Code)
			}
			if v = accessOf(t, a, user); !v.Active || v.ProfileRequired {
				t.Fatal("verified account still blocked", v)
			}
		})
	}
}

func TestRegistrationWithoutSMSPreservesOnlyUnchangedPhoneVerification(t *testing.T) {
	a, user, _ := activationFixture(t)
	a.Config.Production = true
	before, e := a.Store.Get(t.Context(), "users", "user-a")
	if e != nil {
		t.Fatal(e)
	}
	var old map[string]any
	_ = json.Unmarshal(before.Data, &old)
	old["phoneVerifiedAt"] = "2026-11-10T00:00:00Z"
	before.Data = core.Data(old)
	if _, e = a.Store.Put(t.Context(), "users", before, before.Version); e != nil {
		t.Fatal(e)
	}
	oldPhone := old["phone"].(string)
	if _, e = a.Store.Put(t.Context(), "phone_owners", core.Record{ID: oldPhone, Data: core.Data(phoneOwner{User: "user-a"})}, 0); e != nil {
		t.Fatal(e)
	}
	for _, input := range []map[string]string{
		{"name": " "}, {"name": strings.Repeat("名", 31)},
		{"name": "李四"}, {"name": "李四", "phone": "123"},
	} {
		if w := call(a, "POST", "/api/access/profile", user, "", input); w.Code != 400 {
			t.Fatal("invalid profile input accepted", w.Code)
		}
	}
	if w := call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "李四", "phone": oldPhone}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	after, _ := a.Store.Get(t.Context(), "users", "user-a")
	var saved map[string]any
	_ = json.Unmarshal(after.Data, &saved)
	for _, key := range []string{"phone", "verifiedPhone", "phoneVerifiedAt", "nickname"} {
		if saved[key] != old[key] {
			t.Fatal("unchanged phone lost verification", key)
		}
	}
	if saved["name"] != "李四" {
		t.Fatal("name not saved")
	}
	if w := call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "李四", "phone": "13900139009", "code": "123456"}); w.Code != 200 {
		t.Fatal("unverified phone update failed", w.Code)
	}
	after, _ = a.Store.Get(t.Context(), "users", "user-a")
	// Decode into a fresh map so removed JSON fields cannot remain in the test.
	saved = nil
	_ = json.Unmarshal(after.Data, &saved)
	if saved["phone"] != "13900139009" || saved["verifiedPhone"] != nil || saved["phoneVerifiedAt"] != nil {
		t.Fatal("changed phone kept old verification", saved)
	}
	owner, _ := a.Store.Get(t.Context(), "phone_owners", oldPhone)
	var claim phoneOwner
	_ = json.Unmarshal(owner.Data, &claim)
	if claim.User != "" {
		t.Fatal("old phone ownership was not released")
	}
}

func TestConfiguredSMSCannotBeSkippedByMissingCode(t *testing.T) {
	a, _, _ := activationFixture(t)
	a.Config.Production = true
	a.SMS = &fakeSMS{}
	user := newMiniUser(t, a, "needs-phone")
	if v := accessOf(t, a, user); !v.ProfileRequired || !v.PhoneVerificationRequired {
		t.Fatal("SMS requirement missing", v)
	}
	if w := call(a, "POST", "/api/access/profile", user, "", map[string]any{"name": "王五", "phone": "13900139009"}); w.Code != 400 {
		t.Fatal("caller bypassed configured SMS", w.Code)
	}
	if v := accessOf(t, a, user); !v.ProfileRequired {
		t.Fatal("phone input without a code verified a phone")
	}
}
