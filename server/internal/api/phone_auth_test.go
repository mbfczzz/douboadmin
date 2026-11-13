package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func loginChallenge(t *testing.T, a *Server, phone, source string) map[string]string {
	t.Helper()
	sender := &fakeSMS{}
	a.SMS = sender
	w := call(a, "POST", "/api/auth/phone/code", "", "", map[string]string{"phone": phone, "source": source})
	var response struct{ Challenge string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &response) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), sender.code) {
		t.Fatal("OTP leaked")
	}
	return map[string]string{"phone": phone, "source": source, "challenge": response.Challenge, "code": sender.code}
}

func TestPhoneAuthSharesWeChatUserAndNeverGrantsAdmin(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone"})
	var wx struct{ UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &wx) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	off := false
	a.Config.SMSVerificationEnabled = &off
	for _, source := range []string{"app", "other"} {
		a.Sessions.limits = map[string]bucket{}
		body := loginChallenge(t, a, "13900139000", source)
		w = call(a, "POST", "/api/auth/phone/login", "", "", body)
		var session struct{ Token, UserID string }
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &session) != nil || session.UserID != wx.UserID {
			t.Fatal(w.Code, w.Body.String())
		}
		if call(a, "GET", "/api/admin/me", session.Token, "", nil).Code != 403 {
			t.Fatal("admin privilege granted")
		}
		if call(a, "POST", "/api/auth/phone/login", "", "", body).Code != 400 {
			t.Fatal("OTP replay accepted")
		}
	}
	row, _ := a.Store.Get(t.Context(), "users", wx.UserID)
	var profile struct {
		Source          string
		Sources         []string
		LastLoginSource string
	}
	json.Unmarshal(row.Data, &profile)
	if profile.Source != "miniprogram" || len(profile.Sources) != 3 || profile.LastLoginSource != "other" {
		t.Fatal(profile)
	}
}

func TestPhoneAuthAppFirstThenWeChatReusesID(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	body := loginChallenge(t, a, "13900139000", "app")
	w := call(a, "POST", "/api/auth/phone/login", "", "", body)
	var app struct{ UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &app) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone"})
	var wx struct{ UserID, Token string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &wx) != nil || wx.UserID != app.UserID {
		t.Fatal(w.Code, w.Body.String())
	}
	again := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx"})
	if again.Code != 200 || !strings.Contains(again.Body.String(), app.UserID) {
		t.Fatal("credential alias lost", again.Body.String())
	}
	session, _ := a.Sessions.Get(t.Context(), wx.Token)
	if session.WeChatOpenID != "first-openid" {
		t.Fatal("payment subject missing")
	}
}

func TestPhoneAuthConcurrentConsumptionAndNoSMSBypass(t *testing.T) {
	a, _, _ := setup(t)
	a.Config.DemoLogin = true
	off := false
	a.Config.SMSVerificationEnabled = &off
	if call(a, "POST", "/api/auth/phone/code", "", "", map[string]string{"phone": "13800138000"}).Code != 503 {
		t.Fatal("unconfigured SMS bypassed")
	}
	body := loginChallenge(t, a, "13800138000", "app")
	var successes atomic.Int32
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if call(a, "POST", "/api/auth/phone/login", "", "", body).Code == 200 {
				successes.Add(1)
			}
		}()
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatal("code consumed multiple times", successes.Load())
	}
	users, _ := a.Store.List(t.Context(), "users", "")
	if len(users) != 1 {
		t.Fatal("duplicate users", len(users))
	}
}

func TestPhoneAuthRejectsWrongExpiredAndUnverifiedAccounts(t *testing.T) {
	for _, scenario := range []string{"wrong", "expired", "source", "unverified", "disabled"} {
		t.Run(scenario, func(t *testing.T) {
			a, _, _ := setup(t)
			phone := "13800138000"
			body := loginChallenge(t, a, phone, "app")
			want := 400
			switch scenario {
			case "wrong":
				body["code"] = "000000"
				if a.SMS.(*fakeSMS).code == body["code"] {
					body["code"] = "111111"
				}
			case "source":
				body["source"] = "other"
			case "expired":
				row, c, _ := recordOf[phoneLoginCode](t.Context(), a.Store, "phone_login_codes", loginCodeID(phone))
				c.ExpiresAt = time.Now().Add(-time.Minute)
				row.Data = core.Data(c)
				a.Store.Put(t.Context(), "phone_login_codes", row, row.Version)
			case "unverified", "disabled":
				p := map[string]any{"phone": phone, "nickname": "existing"}
				want = 409
				if scenario == "disabled" {
					p["disabled"] = true
					want = 403
				}
				a.Store.Put(t.Context(), "users", core.Record{ID: "old", Owner: "old", Data: core.Data(p)}, 0)
			}
			if w := call(a, "POST", "/api/auth/phone/login", "", "", body); w.Code != want || strings.Contains(w.Body.String(), `"token"`) {
				t.Fatal(w.Code, w.Body.String())
			}
		})
	}
}
