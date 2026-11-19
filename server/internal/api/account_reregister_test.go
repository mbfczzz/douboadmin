package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

// A deleted (not disabled) account frees its WeChat link and phone: every way
// back in must reach a NEW account, and the number must register again.
func TestDeletedAccountCanRegisterAgainEveryWay(t *testing.T) {
	deleted := func(t *testing.T) (*Server, *string, string) {
		t.Helper()
		a, openid := phoneLoginFixture(t)
		w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone"})
		var s struct{ Token, UserID string }
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &s) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		if w = call(a, "POST", "/api/access/profile", s.Token, "", map[string]string{"name": "本人", "phone": "13900139000"}); w.Code != 200 {
			t.Fatal("register", w.Code, w.Body.String())
		}
		row, _ := a.Store.Get(t.Context(), "users", s.UserID)
		admin := adminLoginToken(t, a, "admin", "Tt661ea2")
		if w = call(a, "DELETE", "/api/admin/users/"+s.UserID, admin, "", map[string]any{"version": row.Version, "reason": "用户申请注销"}); w.Code != 200 {
			t.Fatal("delete", w.Code, w.Body.String())
		}
		a.Sessions.limits = map[string]bucket{}
		return a, openid, s.UserID
	}
	fresh := func(t *testing.T, old string, w *httptest.ResponseRecorder) string {
		t.Helper()
		var s struct{ Token, UserID string }
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &s) != nil || s.UserID == "" || s.UserID == old {
			t.Fatal("did not reach a new account", w.Code, w.Body.String())
		}
		return s.Token
	}
	register := func(t *testing.T, a *Server, token string) {
		t.Helper()
		if w := call(a, "POST", "/api/access/profile", token, "", map[string]string{"name": "重新注册", "phone": "13900139000"}); w.Code != 200 {
			t.Fatal("number cannot register again", w.Code, w.Body.String())
		}
	}
	t.Run("same WeChat, phone authorization", func(t *testing.T) {
		a, _, old := deleted(t)
		token := fresh(t, old, call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone"}))
		register(t, a, token)
	})
	t.Run("same WeChat, plain login", func(t *testing.T) {
		a, _, old := deleted(t)
		fresh(t, old, call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx"}))
	})
	t.Run("another WeChat, phone authorization", func(t *testing.T) {
		a, openid, old := deleted(t)
		*openid = "another-openid"
		token := fresh(t, old, call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone"}))
		register(t, a, token)
	})
	t.Run("SMS login with the number", func(t *testing.T) {
		a, _, old := deleted(t)
		token := fresh(t, old, call(a, "POST", "/api/auth/phone/login", "", "", loginChallenge(t, a, "13900139000", "miniprogram")))
		register(t, a, token)
	})
}

// After deleting account A (number X), this WeChat logged into account B with
// another number. Authorising X again on the same WeChat must say the WeChat
// belongs to another account (use 使用其他手机号), not that X is taken.
func TestPhoneAuthOnWeChatLinkedToAnotherAccountExplainsTheWayIn(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone"})
	var first struct{ UserID string }
	_ = json.Unmarshal(w.Body.Bytes(), &first)
	row, _ := a.Store.Get(t.Context(), "users", first.UserID)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	if w = call(a, "DELETE", "/api/admin/users/"+first.UserID, admin, "", map[string]any{"version": row.Version, "reason": "用户申请注销"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	a.Sessions.limits = map[string]bucket{}
	// The same WeChat now signs in to account B, which registers another number.
	w = call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx"})
	var b struct{ Token, UserID string }
	_ = json.Unmarshal(w.Body.Bytes(), &b)
	off := false
	a.Config.SMSVerificationEnabled = &off
	if w = call(a, "POST", "/api/access/profile", b.Token, "", map[string]string{"name": "账号B", "phone": "13800138000"}); w.Code != 200 {
		t.Fatal("B register", w.Code, w.Body.String())
	}
	w = call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone"})
	t.Log(w.Code, w.Body.String())
	if w.Code == 200 || !json.Valid(w.Body.Bytes()) || !strings.Contains(w.Body.String(), "使用其他手机号") {
		t.Fatal("misleading answer for a free number on a WeChat linked elsewhere", w.Code, w.Body.String())
	}
	// The SMS route reaches a new account for X.
	body := loginChallenge(t, a, "13900139000", "miniprogram")
	if w = call(a, "POST", "/api/auth/phone/login", "", "", body); w.Code != 200 {
		t.Fatal("SMS login with the freed number", w.Code, w.Body.String())
	}
}
