package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func phoneLoginFixture(t *testing.T) (*Server, *string) {
	a, _, _ := activationFixture(t)
	enableWeChat(a)
	a.SMS = &fakeSMS{}
	openid := "first-openid"
	a.WeChat.HTTP = wxTransport(func(r *http.Request) (*http.Response, error) {
		body := `{"openid":"` + openid + `"}`
		switch r.URL.Path {
		case "/cgi-bin/stable_token":
			body = `{"access_token":"private-token","expires_in":7200}`
		case "/wxa/business/getuserphonenumber":
			body = `{"errcode":0,"phone_info":{"purePhoneNumber":"13900139000","countryCode":"86","watermark":{"appid":"wx-test"}}}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	return a, &openid
}

func TestPhoneLoginVerifiesPhoneWithoutSkippingNameOrActivation(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx-code", "phoneCode": "phone-code"})
	var session struct{ Token, UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &session) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "private-token") {
		t.Fatal("token leak")
	}
	access := accessOf(t, a, session.Token)
	if !access.PhoneVerified || access.PhoneVerificationRequired || !access.ProfileRequired || access.Active {
		t.Fatal(access)
	}
	wrong := call(a, "POST", "/api/access/profile", session.Token, "", map[string]string{"name": "姓名", "phone": "13900139001"})
	if wrong.Code != 400 {
		t.Fatal("another phone bypassed SMS", wrong.Code)
	}
	w = call(a, "POST", "/api/access/profile", session.Token, "", map[string]string{"name": "姓名", "phone": "13900139000"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	access = accessOf(t, a, session.Token)
	if access.ProfileRequired || access.Active {
		t.Fatal("activation was bypassed", access)
	}
	row, _ := a.Store.Get(t.Context(), "users", session.UserID)
	if !strings.Contains(string(row.Data), `"verifiedPhone":"13900139000"`) {
		t.Fatal("phone proof missing")
	}
}

func TestVerifiedPhoneReusesUserAndDoesNotTrustClientPhone(t *testing.T) {
	a, openid := phoneLoginFixture(t)
	body := map[string]string{"code": "wx-code", "phoneCode": "phone-code"}
	w := call(a, "POST", "/api/auth/wechat", "", "", body)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	*openid = "another-openid"
	w = call(a, "POST", "/api/auth/wechat", "", "", body)
	if w.Code != 200 || !strings.Contains(w.Body.String(), core.Digest("wx-testfirst-openid")[:32]) {
		t.Fatal("verified phone did not reuse original user", w.Code, w.Body.String())
	}
	body["phone"] = "13900139001"
	if w = call(a, "POST", "/api/auth/wechat", "", "", body); w.Code != 400 {
		t.Fatal("client phone accepted", w.Code)
	}
	owner, err := a.Store.Get(t.Context(), "phone_owners", "13900139000")
	if err != nil || !strings.Contains(string(owner.Data), core.Digest("wx-testfirst-openid")[:32]) {
		t.Fatal("phone ownership moved")
	}
}
