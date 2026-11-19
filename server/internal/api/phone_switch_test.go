package api

import (
	"encoding/json"
	"testing"
)

// After logging out, "使用其他手机号" signs in another phone's account by SMS.
// The session carries this WeChat ID (WeChat Pay needs it) while the WeChat
// identity stays linked to the account it already belongs to.
func TestMiniProgramSMSLoginSwitchesAccountAndKeepsWeChatLink(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone"})
	var first struct{ UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &first) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	body := loginChallenge(t, a, "13800138000", "miniprogram")
	body["wechatCode"] = "wx-again"
	w = call(a, "POST", "/api/auth/phone/login", "", "", body)
	var other struct{ Token, UserID, Provider string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &other) != nil || other.UserID == first.UserID || other.Provider != "phone" {
		t.Fatal("did not switch to the other phone's account", w.Code, w.Body.String())
	}
	session, err := a.Sessions.Get(t.Context(), other.Token)
	if err != nil || session.WeChatOpenID != "first-openid" || session.WeChatAppID == "" {
		t.Fatal("SMS session lacks the WeChat ID for payment", session, err)
	}
	// Plain WeChat login still returns the WeChat-linked account.
	w = call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx"})
	var again struct{ UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &again) != nil || again.UserID != first.UserID {
		t.Fatal("SMS login relinked the WeChat identity", w.Body.String())
	}
}
