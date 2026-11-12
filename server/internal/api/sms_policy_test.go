package api

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSMSPolicyOffSkipsCodeButNotProfileOrActivation(t *testing.T) {
	a, _, _ := activationFixture(t)
	enabled := false
	a.Config.SMSVerificationEnabled = &enabled
	sender := &fakeSMS{}
	a.SMS = sender
	token := newMiniUser(t, a, "sms-off-user")
	if v := accessOf(t, a, token); v.PhoneVerificationRequired || !v.ProfileRequired {
		t.Fatal("wrong public policy", v)
	}
	w := call(a, "POST", "/api/access/sms", token, "", map[string]string{"phone": "13900139000"})
	if w.Code != 403 || sender.phone != "" {
		t.Fatal("disabled switch allowed SMS delivery", w.Code)
	}
	w = call(a, "POST", "/api/access/profile", token, "", map[string]string{"name": "用户", "phone": "bad"})
	if w.Code != 400 {
		t.Fatal("disabled verification bypassed phone format", w.Code)
	}
	w = call(a, "POST", "/api/access/profile", token, "", map[string]string{"name": "用户", "phone": "13900139000"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if v := accessOf(t, a, token); v.ProfileRequired || v.Active || v.PhoneVerificationRequired {
		t.Fatal("profile registration changed activation rules", v)
	}
	row, _ := a.Store.Get(t.Context(), "users", "sms-off-user")
	var profile map[string]any
	_ = json.Unmarshal(row.Data, &profile)
	if profile["verifiedPhone"] != nil || profile["phoneVerifiedAt"] != nil {
		t.Fatal("unverified registration created phone ownership")
	}
	// Simulate loading an enabled policy after the service restarts.
	enabled = true
	if v := accessOf(t, a, token); !v.ProfileRequired || !v.PhoneVerificationRequired {
		t.Fatal("reenabling did not require verification", v)
	}
	w = call(a, "POST", "/api/access/profile", token, "", map[string]string{"name": "用户", "phone": "13900139000"})
	if w.Code != 400 || !strings.Contains(w.Body.String(), "验证码") {
		t.Fatal("stale client bypassed verification", w.Code, w.Body.String())
	}
	w = call(a, "POST", "/api/access/sms", token, "", map[string]string{"phone": "13900139000"})
	if w.Code != 200 || len(sender.code) != 6 || strings.Contains(w.Body.String(), "debugCode") {
		t.Fatal("enabled sender not used", w.Code, w.Body.String())
	}
	w = call(a, "POST", "/api/access/profile", token, "", map[string]string{"name": "用户", "phone": sender.phone, "code": sender.code})
	if w.Code != 200 || accessOf(t, a, token).ProfileRequired {
		t.Fatal("valid verification failed", w.Code, w.Body.String())
	}
}

func TestExplicitSMSPolicyFailsClosedWithoutSender(t *testing.T) {
	a, _, _ := activationFixture(t)
	enabled := true
	a.Config.SMSVerificationEnabled = &enabled
	a.SMS = nil
	token := newMiniUser(t, a, "sms-no-sender")
	if !accessOf(t, a, token).PhoneVerificationRequired {
		t.Fatal("missing sender disabled verification")
	}
	w := call(a, "POST", "/api/access/sms", token, "", map[string]string{"phone": "13900139000"})
	if w.Code != 503 || strings.Contains(w.Body.String(), "debugCode") {
		t.Fatal("explicit verification fell back to demo", w.Code, w.Body.String())
	}
	w = call(a, "POST", "/api/access/profile", token, "", map[string]string{"name": "用户", "phone": "13900139000"})
	if w.Code != 400 {
		t.Fatal("unverified registration allowed", w.Code)
	}
}
