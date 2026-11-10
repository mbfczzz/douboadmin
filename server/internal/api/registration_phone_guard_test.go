package api

import (
	"encoding/json"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestUnverifiedRegistrationCannotTakeAnotherVerifiedPhone(t *testing.T) {
	a, _, _ := activationFixture(t)
	a.Config.DemoLogin = false
	const phone = "13900139019"
	if _, e := a.Store.Put(t.Context(), "phone_owners", core.Record{ID: phone, Data: core.Data(phoneOwner{User: "verified-user"})}, 0); e != nil {
		t.Fatal(e)
	}
	user := newMiniUser(t, a, "unverified-user")
	w := call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "新用户", "phone": phone})
	if w.Code != 400 || !strings.Contains(w.Body.String(), errPhoneTaken) {
		t.Fatal("another verified phone was accepted", w.Code)
	}
	row, _ := a.Store.Get(t.Context(), "users", "unverified-user")
	var profile map[string]any
	_ = json.Unmarshal(row.Data, &profile)
	if profile["phone"] != nil || profile["name"] != nil || profile["verifiedPhone"] != nil {
		t.Fatal("rejected registration changed user data")
	}
}

func TestExistingNameWithoutPhoneStillRequiresRegistration(t *testing.T) {
	a, _, _ := activationFixture(t)
	a.Config.DemoLogin = false
	user := newMiniUser(t, a, "missing-phone")
	row, _ := a.Store.Get(t.Context(), "users", "missing-phone")
	row.Data = core.Data(map[string]string{"name": "已填姓名"})
	if _, e := a.Store.Put(t.Context(), "users", row, row.Version); e != nil {
		t.Fatal(e)
	}
	v := accessOf(t, a, user)
	if !v.ProfileRequired || v.PhoneVerificationRequired || v.Name != "已填姓名" {
		t.Fatal("missing phone skipped the form", v)
	}
	if w := call(a, "GET", "/api/templates", user, "", nil); w.Code != 403 || !strings.Contains(w.Body.String(), errBasicProfileRequired) {
		t.Fatal("unconfigured SMS produced the wrong registration prompt", w.Code, w.Body.String())
	}
	w := call(a, "POST", "/api/access/join", user, "", map[string]string{"code": "ABCD2345", "method": "scan"})
	if w.Code != 403 || !strings.Contains(w.Body.String(), "PROFILE_REQUIRED") {
		t.Fatal("missing phone reached scan registration", w.Code)
	}
}
