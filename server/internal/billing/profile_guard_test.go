package billing

import (
	"doubo/server/internal/core"
	"testing"
	"time"
)

func TestOrderRechecksDisabledProfileAfterQuote(t *testing.T) {
	s, p, ctx, _, _ := channelFixture(t)
	quote, _, e := p.UserQuote(ctx, "user", 10000, 100)
	if e != nil {
		t.Fatal(e)
	}
	user, e := s.Store.Get(ctx, "users", "user")
	if e != nil {
		t.Fatal(e)
	}
	user.Data = core.Data(map[string]any{"nickname": "test", "disabled": true})
	if _, e = s.Store.Put(ctx, "users", user, user.Version); e != nil {
		t.Fatal(e)
	}
	if _, e = s.CreateOrder(ctx, "user", "disabled-order", 10000, core.DefaultPlatform(), "app", "merchant", "openid", quote.PricingVersion); e == nil {
		t.Fatal("disabled user created a new recharge order")
	}
	orders, e := s.Store.List(ctx, "orders", "user")
	if e != nil {
		t.Fatal(e)
	}
	if len(orders) != 0 {
		t.Fatal("rejected order persisted", len(orders))
	}
}

func TestPreviouslyCreatedPaymentStillSettlesAfterSuspension(t *testing.T) {
	s, p, ctx, _, _ := channelFixture(t)
	quote, _, e := p.UserQuote(ctx, "user", 10000, 100)
	if e != nil {
		t.Fatal(e)
	}
	order, e := s.CreateOrder(ctx, "user", "pre-disable-order", 10000, core.DefaultPlatform(), "app", "merchant", "openid", quote.PricingVersion)
	if e != nil {
		t.Fatal(e)
	}
	user, e := s.Store.Get(ctx, "users", "user")
	if e != nil {
		t.Fatal(e)
	}
	user.Data = core.Data(map[string]any{"disabled": true})
	if _, e = s.Store.Put(ctx, "users", user, user.Version); e != nil {
		t.Fatal(e)
	}
	result := PaymentResult{OrderID: order.ID, TransactionID: "pre-disable-payment", AppID: "app", MerchantID: "merchant", OpenID: "openid", Currency: "CNY", AmountFen: 10000, PaidAt: time.Now()}
	for range 2 {
		if e = s.Settle(ctx, result); e != nil {
			t.Fatal(e)
		}
	}
	wallet, e := s.Wallet(ctx, "user")
	if e != nil || wallet.Available != 1000000 {
		t.Fatal("verified money lost or doubled", wallet, e)
	}
}
