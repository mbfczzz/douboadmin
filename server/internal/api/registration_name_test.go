package api

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestNameRegistrationWithoutSMSAllowsProviderScan(t *testing.T) {
	for _, role := range []string{"s1", "s2"} {
		t.Run(role, func(t *testing.T) {
			a, _, admin := activationFixture(t)
			a.Config.DemoLogin = false // test deployment: no SMS sender or debug codes
			user := newMiniUser(t, a, "name-user")
			branch := createBranch(t, a, admin, "name-only")
			invite := providerCode(t, a, "GET", branch, role, admin)
			v := accessOf(t, a, user)
			if !v.ProfileRequired || v.PhoneVerificationRequired || v.Message != errNameRequired {
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
			w = call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": " 张三 "})
			if w.Code != 200 {
				t.Fatal("name-only registration failed", w.Code, w.Body.String())
			}
			if v = accessOf(t, a, user); v.ProfileRequired || v.PhoneVerificationRequired || v.Active {
				t.Fatal("wrong next step", v)
			}
			if status, body := joinHTTP(a, user, invite.Code); status != 200 || !strings.Contains(body, `"status":"review"`) {
				t.Fatal(status, body)
			}
			page := registrationPage(t, a, admin, "?status=pending&q=张三")
			var reg core.Registration
			if page.Total != 1 || json.Unmarshal(page.Items[0].Data, &reg) != nil || reg.Name != "张三" || reg.Role != role || reg.ParentID != branch || reg.Phone != "" {
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
		})
	}
}

func TestNameOnlyRegistrationPreservesPhoneVerification(t *testing.T) {
	a, user, _ := activationFixture(t)
	a.Config.Production = true
	before, e := a.Store.Get(t.Context(), "users", "user-a")
	if e != nil {
		t.Fatal(e)
	}
	var old map[string]any
	_ = json.Unmarshal(before.Data, &old)
	for _, input := range []map[string]string{
		{"name": " "}, {"name": strings.Repeat("名", 31)},
		{"name": "李四", "phone": "13900139009", "code": "123456"},
	} {
		if w := call(a, "POST", "/api/access/profile", user, "", input); w.Code != 400 {
			t.Fatal("invalid name-only input accepted", w.Code)
		}
	}
	if w := call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "李四"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	after, _ := a.Store.Get(t.Context(), "users", "user-a")
	var saved map[string]any
	_ = json.Unmarshal(after.Data, &saved)
	for _, key := range []string{"phone", "verifiedPhone", "phoneVerifiedAt", "nickname"} {
		if saved[key] != old[key] {
			t.Fatal("name-only registration changed", key)
		}
	}
	if saved["name"] != "李四" {
		t.Fatal("name not saved")
	}
}

func TestConfiguredSMSCannotBeSkippedByNameOnlyInput(t *testing.T) {
	a, _, _ := activationFixture(t)
	a.Config.Production = true
	a.SMS = &fakeSMS{}
	user := newMiniUser(t, a, "needs-phone")
	if v := accessOf(t, a, user); !v.ProfileRequired || !v.PhoneVerificationRequired {
		t.Fatal("SMS requirement missing", v)
	}
	if w := call(a, "POST", "/api/access/profile", user, "", map[string]any{"name": "王五", "smsRequired": false}); w.Code != 400 {
		t.Fatal("caller bypassed configured SMS", w.Code)
	}
	if v := accessOf(t, a, user); !v.ProfileRequired {
		t.Fatal("name-only input verified a phone")
	}
}
