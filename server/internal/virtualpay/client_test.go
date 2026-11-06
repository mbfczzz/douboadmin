package virtualpay

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestOfficialSignatureVectors(t *testing.T) {
	body := `{"openid": "xxx", "user_ip": "127.0.0.1", "env": 0}`
	if got := MAC("12345", "/xpay/query_user_balance&"+body); got != "c37809f27c6d7fd1837ad2500a04512b66b34fd793a39a385fade56dca89a4b5" {
		t.Fatal(got)
	}
	if got := MAC("9hAb/NEYUlkaMBEsmFgzig==", body); got != "089d9e8dc5d308977360c4b79ec600a93d736802802a807d634192328032f6c7" {
		t.Fatal(got)
	}
}
func TestEmptyConfigIsDisabledAndEnabledConfigFailsClosed(t *testing.T) {
	c, e := New(Config{})
	if e != nil || c.Enabled() || c.Ready() {
		t.Fatal(c, e)
	}
	if _, e = New(Config{Enabled: true}); e == nil {
		t.Fatal("enabled without credentials")
	}
	cfg := testConfig()
	cfg.IOSAllowed = true
	if _, e = New(cfg); e == nil {
		t.Fatal("iOS sandbox accepted")
	}
	cfg = testConfig()
	cfg.Products = append(cfg.Products, cfg.Products[0])
	if _, e = New(cfg); e == nil {
		t.Fatal("duplicate product")
	}
}
func TestSignedDataIsImmutableAndContainsNoSecret(t *testing.T) {
	f := newFixture(t)
	p, e := f.svc.Client.Parameters(f.row.ID, f.order, "session-key")
	if e != nil {
		t.Fatal(e)
	}
	var data map[string]any
	if json.Unmarshal([]byte(p.SignData), &data) != nil {
		t.Fatal("not JSON")
	}
	if data["env"] != float64(1) || data["goodsPrice"] != float64(100) || data["productId"] != "points-100" || data["buyQuantity"] != float64(1) {
		t.Fatal(data)
	}
	if p.PaySig != MAC("sandbox-key", "requestVirtualPayment&"+p.SignData) || p.Signature != MAC("session-key", p.SignData) {
		t.Fatal("wrong keys")
	}
	raw := string(core.Data(p))
	for _, secret := range []string{"session-key", "sandbox-key", "fixture-secret"} {
		if strings.Contains(raw, secret) {
			t.Fatal("secret leaked")
		}
	}
}
func TestTransportErrorsNeverExposeCredentials(t *testing.T) {
	f := newFixture(t)
	f.svc.Client.HTTP = doFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("private token and fixture-secret")
	})
	_, e := f.svc.Client.Query(context.Background(), f.row.ID, f.order)
	if e == nil || strings.Contains(e.Error(), "private") || strings.Contains(e.Error(), "fixture-secret") {
		t.Fatal(e)
	}
}
