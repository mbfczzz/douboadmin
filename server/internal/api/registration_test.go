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
	if v := accessOf(t, a, user); !v.ProfileRequired || v.Active || !v.OpenSignup {
		t.Fatal("unregistered access", v)
	}
	w := call(a, "GET", "/api/templates", user, "", nil)
	if w.Code != 403 || !strings.Contains(w.Body.String(), `"profileRequired":true`) {
		t.Fatal("business endpoint before registration", w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/access/direct", "/api/access/redeem"} {
		if w = call(a, "POST", path, user, "", map[string]string{"code": "AAAAAAAAAAAAAAAAAAAA"}); w.Code != 403 || !strings.Contains(w.Body.String(), "PROFILE_REQUIRED") {
			t.Fatal("activation before registration", path, w.Code, w.Body.String())
		}
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
	// Signup open: the user may skip the provider code.
	if w = call(a, "POST", "/api/access/direct", user, "", map[string]any{}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("registered direct user blocked", w.Code, w.Body.String())
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

func TestClosedSignupRequiresProviderCode(t *testing.T) {
	a, _, admin := activationFixture(t)
	w := call(a, "PUT", "/api/admin/signup", admin, "", map[string]any{"version": 0, "openSignup": false})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/admin/signup", admin, "", nil); !strings.Contains(w.Body.String(), `"openSignup":false`) {
		t.Fatal(w.Body.String())
	}
	user := newMiniUser(t, a, "user-closed")
	code := sendCode(t, a, user, "13900139002")
	if w = call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "李四", "phone": "13900139002", "code": code}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if v := accessOf(t, a, user); v.OpenSignup || v.ProfileRequired || v.Active {
		t.Fatal(v)
	}
	if w = call(a, "POST", "/api/access/direct", user, "", map[string]any{}); w.Code != 403 || !strings.Contains(w.Body.String(), "未开放") {
		t.Fatal("direct access while signup closed", w.Code, w.Body.String())
	}
	if w = call(a, "PUT", "/api/admin/signup", newMiniUser(t, a, "user-x"), "", map[string]any{"version": 1, "openSignup": true}); w.Code != 403 {
		t.Fatal("user changed signup", w.Code)
	}
}

func TestProductionSendsRealSMSOnly(t *testing.T) {
	a, _, _ := activationFixture(t)
	a.Config.Production = true
	user := newMiniUser(t, a, "user-prod")
	if w := call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": "13900139003"}); w.Code != 503 {
		t.Fatal("production without SMS", w.Code, w.Body.String())
	}
	// Until SMS is configured nobody is held at the registration step.
	if v := accessOf(t, a, user); v.ProfileRequired {
		t.Fatal("registration enforced without SMS", v)
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
