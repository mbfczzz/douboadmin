package virtualpay

import (
	"bytes"
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"
)

type doFunc func(*http.Request) (*http.Response, error)

func (f doFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }
func response(status int, body any) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(bytes.NewReader(core.Data(body)))}
}
func testConfig() Config {
	return Config{AppID: "wx-test", AppSecret: "fixture-secret", OfferID: "offer-test", AppKey: "live-key", SandboxAppKey: "sandbox-key", Token: "fixture-token", EncodingAESKey: base64.RawStdEncoding.EncodeToString(bytes.Repeat([]byte{17}, 32)), Enabled: true, Env: 1, Products: []Product{{ID: "points-100", Name: "积分商品", AmountFen: 100, PointsUnits: 10000}}}
}

type fixture struct {
	svc        *Service
	row        core.Record
	order      core.Order
	remote     RemoteOrder
	deliveries int
	deliveryOK bool
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	s := store.NewMemory()
	c, e := New(testConfig())
	if e != nil {
		t.Fatal(e)
	}
	b := &billing.Service{Store: s}
	settings := core.DefaultPlatform()
	settings.RechargeEnabled = true
	row, e := b.CreateVirtualOrder(context.Background(), "u", "fixture-key", 100, settings, c.Config.AppID, c.Config.OfferID, "openid", "", core.VirtualOrder{ProductID: "points-100", PointsUnits: 10000, Env: 1, Platform: "android"})
	if e != nil {
		t.Fatal(e)
	}
	var o core.Order
	if e = json.Unmarshal(row.Data, &o); e != nil {
		t.Fatal(e)
	}
	f := &fixture{svc: &Service{Client: c, Store: s, Billing: b}, row: row, order: o, deliveryOK: true}
	f.remote = RemoteOrder{ID: row.ID, WXID: "virtual-transaction", Env: 2, Status: 2, Type: 0, Fee: 100, Paid: 100, PaidTime: time.Now().Unix(), Meta: row.ID, Left: 100}
	c.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cgi-bin/stable_token" {
			return response(200, map[string]any{"access_token": "token", "expires_in": 7200}), nil
		}
		raw, _ := io.ReadAll(r.Body)
		if r.URL.Query().Get("pay_sig") != MAC(c.Config.Key(1), r.URL.Path+"&"+string(raw)) {
			t.Error("outbound signature does not match exact request bytes")
		}
		switch r.URL.Path {
		case "/xpay/query_order":
			return response(200, map[string]any{"errcode": 0, "order": f.remote}), nil
		case "/xpay/notify_provide_goods":
			f.deliveries++
			if !f.deliveryOK {
				return response(503, map[string]int{"errcode": -1}), nil
			}
			return response(200, map[string]int{"errcode": 0}), nil
		default:
			t.Errorf("unexpected upstream path %s", r.URL.Path)
			return response(500, nil), nil
		}
	})
	return f
}
