package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

type fakeSMS struct {
	phone, code string
	err         error
}

func (f *fakeSMS) Ready() bool { return true }
func (f *fakeSMS) Send(_ context.Context, phone, code string) error {
	if f.err == nil {
		f.phone, f.code = phone, code
	}
	return f.err
}

// newMiniUser signs in a WeChat user who has not registered yet.
func newMiniUser(t *testing.T, a *Server, id string) string {
	t.Helper()
	_, _ = a.Store.Put(t.Context(), "users", core.Record{ID: id, Owner: id, Data: core.Data(map[string]string{"nickname": "微信用户"})}, 0)
	token, err := a.Sessions.Create(t.Context(), id, "user")
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func accessOf(t *testing.T, a *Server, token string) accessView {
	t.Helper()
	var v accessView
	w := call(a, "GET", "/api/access", token, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &v) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return v
}

// sendCode requests a code and returns it (development mode echoes it).
func sendCode(t *testing.T, a *Server, token, phone string) string {
	t.Helper()
	w := call(a, "POST", "/api/access/sms", token, "", map[string]string{"phone": phone})
	var out struct{ DebugCode string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return out.DebugCode
}

func TestRegistrationComesBeforeActivation(t *testing.T) {
	a, _, admin := activationFixture(t)
	user := newMiniUser(t, a, "user-new")
	if v := accessOf(t, a, user); !v.ProfileRequired || v.Active {
		t.Fatal("unregistered access", v)
	}
	w := call(a, "GET", "/api/templates", user, "", nil)
	if w.Code != 403 || !strings.Contains(w.Body.String(), `"profileRequired":true`) {
		t.Fatal("business endpoint before registration", w.Code, w.Body.String())
	}
	if w = call(a, "POST", "/api/access/join", user, "", map[string]string{"code": "AAAAAAAA", "method": "scan"}); w.Code != 403 || !strings.Contains(w.Body.String(), "PROFILE_REQUIRED") {
		t.Fatal("activation before registration", w.Code, w.Body.String())
	}
	if w = call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": "12345"}); w.Code != 400 {
		t.Fatal("invalid phone accepted", w.Code)
	}
	code := sendCode(t, a, user, "13900139000")
	if w = call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": "13900139000"}); w.Code != 429 {
		t.Fatal("resend was not throttled", w.Code)
	}
	register := func(phone, code string) string {
		return call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": " 张三 ", "phone": phone, "code": code}).Body.String()
	}
	if b := register("13900139001", code); !strings.Contains(b, "号码不一致") {
		t.Fatal(b)
	}
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	if b := register("13900139000", wrong); !strings.Contains(b, "验证码不正确") {
		t.Fatal(b)
	}
	if b := register("13900139000", code); !strings.Contains(b, `"profileRequired":false`) {
		t.Fatal("registration failed", b)
	}
	if b := register("13900139000", code); !strings.Contains(b, "已失效") {
		t.Fatal("code reused", b)
	}
	row, _ := a.Store.Get(t.Context(), "users", "user-new")
	if !strings.Contains(string(row.Data), `"name":"张三"`) || !strings.Contains(string(row.Data), `"verifiedPhone":"13900139000"`) {
		t.Fatal(string(row.Data))
	}
	// Registered users still need a provider's code and the platform's approval.
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 403 {
		t.Fatal("registered user without a provider", w.Code, w.Body.String())
	}
	joinPartner(t, a, newBranch(t, a, "reg"), "user-new")
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("approved member blocked", w.Code, w.Body.String())
	}
	// The phone is changed only through SMS; the name stays required.
	w = call(a, "PUT", "/api/me", user, "", map[string]any{"version": row.Version, "nickname": "n", "phone": "13700000000"})
	if w.Code != 400 {
		t.Fatal("phone changed without SMS", w.Code, w.Body.String())
	}
	if w = call(a, "PUT", "/api/me", user, "", map[string]any{"version": row.Version, "nickname": "n", "name": " "}); w.Code != 400 {
		t.Fatal("name cleared", w.Code)
	}
	// An administrator changing the phone asks for a fresh SMS check.
	row, _ = a.Store.Get(t.Context(), "users", "user-new")
	if w = call(a, "PUT", "/api/admin/users/user-new", admin, "", map[string]any{"version": row.Version, "nickname": "n", "name": "张三", "phone": "13700000000"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if v := accessOf(t, a, user); !v.ProfileRequired || v.Active || v.Phone != "13700000000" {
		t.Fatal("changed phone kept the old verification", v)
	}
}

func TestProductionSendsRealSMSOnly(t *testing.T) {
	a, _, _ := activationFixture(t)
	a.Config.Production = true
	user := newMiniUser(t, a, "user-prod")
	if w := call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": "13900139003"}); w.Code != 503 {
		t.Fatal("production without SMS", w.Code, w.Body.String())
	}
	// Without SMS a missing name still needs input, but no phone verification.
	if v := accessOf(t, a, user); !v.ProfileRequired || v.PhoneVerificationRequired {
		t.Fatal("incorrect registration step without SMS", v)
	}
	sender := &fakeSMS{}
	a.SMS = sender
	w := call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": "13900139003"})
	if w.Code != 200 || strings.Contains(w.Body.String(), "debugCode") || sender.phone != "13900139003" || len(sender.code) != 6 {
		t.Fatal(w.Code, w.Body.String(), sender)
	}
	if w = call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "王五", "phone": "13900139003", "code": sender.code}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
}
