package virtualpay

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
	"time"
)

func multipleFixture(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	p := f.svc.Client.Config.Products[0]
	goods, amount, err := p.Purchase(10, 1, "android", "custom")
	if err != nil {
		t.Fatal(err)
	}
	f.row, err = f.svc.Billing.CreateVirtualOrder(t.Context(), "u", "multiple-items", amount, core.DefaultPlatform(),
		f.svc.Client.Config.AppID, f.svc.Client.Config.OfferID, "openid", "", goods)
	if err != nil || json.Unmarshal(f.row.Data, &f.order) != nil {
		t.Fatal(err)
	}
	f.remote.ID = f.row.ID
	f.remote.Meta = f.row.ID
	f.remote.Fee, f.remote.Paid, f.remote.Left = amount, amount, amount
	return f
}

func multipleEvent(f *fixture, price int64) Event {
	env := 1
	event := Event{Name: "xpay_goods_deliver_notify", OrderID: f.row.ID, OpenID: "openid", Env: &env}
	_ = json.Unmarshal(core.Data(map[string]any{"ProductId": "points-100", "Quantity": 10,
		"OrigPrice": price, "ActualPrice": price, "Attach": f.row.ID}), &event.Goods)
	return event
}

func TestMultiplePurchaseDeliveryAndExternalRefundAreExactlyOnce(t *testing.T) {
	for _, price := range []int64{100, 1000} {
		f := multipleFixture(t)
		ctx := t.Context()
		event := multipleEvent(f, price)
		for range 2 {
			if err := f.svc.Handle(ctx, event); err != nil {
				t.Fatal(err)
			}
		}
		wallet, _ := f.svc.Billing.Wallet(ctx, "u")
		entries, _ := f.svc.Store.List(ctx, "wallet_ledger", "u")
		if wallet.Available != 100000 || len(entries) != 1 {
			t.Fatal(wallet, len(entries))
		}
		code := 0
		refund := Event{Name: "xpay_refund_notify", Env: event.Env, OpenID: "openid", RefundOrderID: f.row.ID,
			RefundID: "multiple-refund", RefundWXID: "wx-refund-multiple", PayWXID: f.remote.WXID,
			RefundFee: 1000, RetCode: &code, RefundTime: time.Now().Unix()}
		for range 2 {
			if err := f.svc.Handle(ctx, refund); err != nil {
				t.Fatal(err)
			}
		}
		wallet, _ = f.svc.Billing.Wallet(ctx, "u")
		entries, _ = f.svc.Store.List(ctx, "wallet_ledger", "u")
		_, order, _ := f.svc.order(ctx, f.row.ID)
		if wallet.Available != 0 || wallet.Held != 0 || len(entries) != 3 || order.Status != "refunded" {
			t.Fatal(wallet, len(entries), order.Status)
		}
	}
}

func TestMultiplePurchaseRejectsWrongQuantityPriceAndPaidTotal(t *testing.T) {
	for _, field := range []string{"quantity", "price", "paid-total"} {
		f := multipleFixture(t)
		event := multipleEvent(f, 100)
		switch field {
		case "quantity":
			event.Goods.Quantity = 9
		case "price":
			event.Goods.ActualPrice = 99
		case "paid-total":
			f.remote.Paid = 100
		}
		if err := f.svc.Handle(t.Context(), event); err == nil {
			t.Fatal("mismatch accepted", field)
		}
		wallet, _ := f.svc.Billing.Wallet(t.Context(), "u")
		if wallet.Available != 0 || wallet.Held != 0 {
			t.Fatal("invalid payment credited points", field, wallet)
		}
	}
}
