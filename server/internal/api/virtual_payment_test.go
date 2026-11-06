package api

import (
	"bytes"
	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
	"doubo/server/internal/wechat"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

type virtualHTTP func(*http.Request) (*http.Response, error)

func (f virtualHTTP) Do(r *http.Request) (*http.Response, error) { return f(r) }
func virtualResponse(body any) *http.Response {
	return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(core.Data(body)))}
}
func virtualFixture(t *testing.T) (*Server, string, string) {
	t.Helper()
	a, user, other := setup(t)
	a.Config.PaymentChannel = virtualpay.Channel
	cfg := virtualpay.Config{AppID: "wx-fixture", AppSecret: "fixture-secret", OfferID: "offer", SandboxAppKey: "sandbox", Token: "token", EncodingAESKey: base64.RawStdEncoding.EncodeToString(bytes.Repeat([]byte{17}, 32)), Enabled: true, Env: 1, Products: []virtualpay.Product{{ID: "pack", Name: "积分包", AmountFen: 100, PointsUnits: 10000}}}
	c, e := virtualpay.New(cfg)
	if e != nil {
		t.Fatal(e)
	}
	a.Virtual = &virtualpay.Service{Client: c, Store: a.Store, Billing: a.Billing}
	a.WeChat = wechat.New(cfg.AppID, cfg.AppSecret)
	a.WeChat.HTTP = virtualHTTP(func(*http.Request) (*http.Response, error) {
		return virtualResponse(map[string]string{"openid": "openid-a", "session_key": "private-session-key"}), nil
	})
	settings := core.DefaultPlatform()
	settings.RechargeEnabled = true
	_, e = a.Store.Put(t.Context(), "settings", core.Record{ID: "platform", Data: core.Data(settings)}, 0)
	if e != nil {
		t.Fatal(e)
	}
	_, e = a.Store.Put(t.Context(), "wechat_identities", core.Record{ID: "user-a", Data: core.Data(map[string]string{"openid": "openid-a"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	return a, user, other
}
func virtualOrder(t *testing.T, a *Server, token string) core.Record {
	t.Helper()
	w := call(a, "POST", "/api/orders", token, "virtual-fixture-order", map[string]any{"productId": "pack", "settingsVersion": 1, "platform": "android"})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var row core.Record
	if json.Unmarshal(w.Body.Bytes(), &row) != nil {
		t.Fatal(w.Body.String())
	}
	return row
}
func TestVirtualPaymentAuthorizationAndSingleSignature(t *testing.T) {
	a, user, other := virtualFixture(t)
	row := virtualOrder(t, a, user)
	if w := call(a, "POST", "/api/orders/"+row.ID+"/pay", other, "", map[string]string{"code": "code", "platform": "android"}); w.Code != 404 {
		t.Fatal(w.Code)
	}
	a.WeChat.HTTP = virtualHTTP(func(*http.Request) (*http.Response, error) {
		return virtualResponse(map[string]string{"openid": "wrong-user", "session_key": "key"}), nil
	})
	if w := call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "code", "platform": "android"}); w.Code != 403 {
		t.Fatal(w.Code)
	}
	a.WeChat.HTTP = virtualHTTP(func(*http.Request) (*http.Response, error) {
		return virtualResponse(map[string]string{"openid": "openid-a", "session_key": "private-session-key"}), nil
	})
	w := call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "fresh-code", "platform": "android"})
	if w.Code != 200 || strings.Contains(w.Body.String(), "private-session-key") {
		t.Fatal(w.Code, w.Body.String())
	}
	var params virtualpay.Params
	_ = json.Unmarshal(w.Body.Bytes(), &params)
	if params.Mode != "short_series_goods" || params.Channel != virtualpay.Channel || params.Signature == "" {
		t.Fatal(params)
	}
	if w = call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "another-code", "platform": "android"}); w.Code != 409 {
		t.Fatal("reissued outTradeNo", w.Code)
	}
}
func TestVirtualSafeNotificationCreditsOnce(t *testing.T) {
	a, user, _ := virtualFixture(t)
	row := virtualOrder(t, a, user)
	c := a.Virtual.Client
	c.HTTP = virtualHTTP(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/cgi-bin/stable_token":
			return virtualResponse(map[string]any{"access_token": "token", "expires_in": 7200}), nil
		case "/xpay/query_order":
			return virtualResponse(map[string]any{"errcode": 0, "order": virtualpay.RemoteOrder{ID: row.ID, WXID: "wx-platform-order", Status: 2, Env: 2, Type: 0, Fee: 100, Paid: 100, PaidTime: time.Now().Unix(), Meta: row.ID}}), nil
		case "/xpay/notify_provide_goods":
			return virtualResponse(map[string]int{"errcode": 0}), nil
		}
		t.Errorf("unexpected path %s", r.URL.Path)
		return virtualResponse(map[string]int{"errcode": -1}), nil
	})
	body := core.Data(map[string]any{"MsgType": "event", "Event": "xpay_goods_deliver_notify", "OpenId": "openid-a", "OutTradeNo": row.ID, "Env": 1, "GoodsInfo": map[string]any{"ProductId": "pack", "Quantity": 1, "OrigPrice": 100, "ActualPrice": 100, "Attach": row.ID}})
	raw, e := c.Reply(body, false)
	if e != nil {
		t.Fatal(e)
	}
	var env map[string]string
	_ = json.Unmarshal(raw, &env)
	q := url.Values{"msg_signature": {env["MsgSignature"]}, "timestamp": {env["TimeStamp"]}, "nonce": {env["Nonce"]}}
	for range 2 {
		req := httptest.NewRequest("POST", "/api/payments/virtual/notify?"+q.Encode(), bytes.NewReader(raw))
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, req)
		if w.Code != 200 || w.Body.String() != "success" {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	wallet, e := a.Billing.Wallet(t.Context(), "user-a")
	if e != nil || wallet.Available != 10000 {
		t.Fatal(wallet, e)
	}
	entries, _ := a.Store.List(t.Context(), "wallet_ledger", "user-a")
	if len(entries) != 1 {
		t.Fatal(len(entries))
	}
	if w := call(a, "POST", "/api/payments/virtual/notify", "", "", json.RawMessage(body)); w.Code != 403 {
		t.Fatal("unsigned notification accepted")
	}
	if w := call(a, "GET", "/api/admin/virtual-payments/events", user, "", nil); w.Code != 403 {
		t.Fatal("user accessed payment audit")
	}
}
func TestVirtualDisabledAndIncompatibleCatalog(t *testing.T) {
	a, user, _ := virtualFixture(t)
	a.Virtual.Client.Config.Products[0].PointsUnits = 999
	w := call(a, "GET", "/api/wallet", user, "", nil)
	var info struct {
		PaymentReady bool                 `json:"paymentReady"`
		Products     []virtualpay.Product `json:"virtualProducts"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &info)
	if info.PaymentReady || len(info.Products) != 0 {
		t.Fatal(w.Body.String())
	}
	w = call(a, "POST", "/api/orders", user, "invalid-product-order", map[string]any{"productId": "pack", "settingsVersion": 1, "platform": "android"})
	if w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	a.Virtual.Client.Config.Enabled = false
	w = call(a, "POST", "/api/orders", user, "disabled-product-order", map[string]any{"productId": "pack", "settingsVersion": 1, "platform": "android"})
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
}
