package virtualpay

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCreditAndDeliveryOutboxAreIdempotent(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.deliveryOK = false
	if e := f.svc.Refresh(ctx, f.row.ID); e == nil {
		t.Fatal("missing delivery failure")
	}
	wallet, _ := f.svc.Billing.Wallet(ctx, "u")
	if wallet.Available != 10000 {
		t.Fatal(wallet)
	}
	f.deliveryOK = true
	for range 3 {
		if e := f.svc.Refresh(ctx, f.row.ID); e != nil {
			t.Fatal(e)
		}
	}
	wallet, _ = f.svc.Billing.Wallet(ctx, "u")
	if wallet.Available != 10000 {
		t.Fatal("duplicate credit", wallet)
	}
	ledger, _ := f.svc.Store.List(ctx, "wallet_ledger", "u")
	if len(ledger) != 1 {
		t.Fatal(len(ledger))
	}
	outbox, _ := f.svc.Store.Get(ctx, "virtual_deliveries", f.row.ID)
	if string(outbox.Data) != `{"status":"done"}` {
		t.Fatal(string(outbox.Data))
	}
}
func TestMismatchedRemoteCannotCredit(t *testing.T) {
	for _, field := range []string{"amount", "env", "order", "meta", "type"} {
		t.Run(field, func(t *testing.T) {
			f := newFixture(t)
			switch field {
			case "amount":
				f.remote.Paid++
			case "env":
				f.remote.Env = 1
			case "order":
				f.remote.ID = "other"
			case "meta":
				f.remote.Meta = "other"
			case "type":
				f.remote.Type = 1
			}
			if e := f.svc.Refresh(context.Background(), f.row.ID); e == nil {
				t.Fatal("mismatch accepted")
			}
			w, _ := f.svc.Billing.Wallet(context.Background(), "u")
			if w.Available != 0 {
				t.Fatal(w)
			}
		})
	}
}
func TestSignatureCanOnlyBeClaimedOnce(t *testing.T) {
	f := newFixture(t)
	var won atomic.Int32
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if f.svc.ClaimSignature(context.Background(), f.row.ID) == nil {
				won.Add(1)
			}
		}()
	}
	wg.Wait()
	if won.Load() != 1 {
		t.Fatal(won.Load())
	}
}
func TestCatalogCreditIsIndependentOfLegacyRate(t *testing.T) {
	f := newFixture(t)
	row, e := f.svc.Billing.CreateVirtualOrder(context.Background(), "u", "other-key", 100, core.DefaultPlatform(), "wx-test", "offer-test", "openid", "", core.VirtualOrder{ProductID: "p", PointsUnits: 99999, Env: 1})
	if e != nil {
		t.Fatal(e)
	}
	var order core.Order
	if json.Unmarshal(row.Data, &order) != nil || order.PointsUnits != 99999 {
		t.Fatal("catalog credit was repriced", string(row.Data))
	}
}
func TestV3ResultCannotSettleVirtualOrder(t *testing.T) {
	f := newFixture(t)
	e := f.svc.Billing.Settle(context.Background(), billing.PaymentResult{OrderID: f.row.ID, TransactionID: "x", AppID: f.order.AppID, MerchantID: f.order.MerchantID, OpenID: f.order.OpenID, Currency: "CNY", AmountFen: 100, PaidAt: time.Now()})
	if e == nil {
		t.Fatal("cross channel settlement accepted")
	}
}
func TestExternalFullRefundAndDuplicateNotify(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if e := f.svc.Refresh(ctx, f.row.ID); e != nil {
		t.Fatal(e)
	}
	env, code := 1, 0
	event := Event{Name: "xpay_refund_notify", Env: &env, OpenID: "openid", RefundOrderID: f.row.ID, RefundID: "external-refund", RefundWXID: "refund-wx", PayWXID: f.remote.WXID, RefundFee: 100, RetCode: &code, RefundTime: time.Now().Unix()}
	for range 2 {
		if e := f.svc.Handle(ctx, event); e != nil {
			t.Fatal(e)
		}
	}
	w, _ := f.svc.Billing.Wallet(ctx, "u")
	if w.Available != 0 || w.Held != 0 {
		t.Fatal(w)
	}
	row, _ := f.svc.Store.Get(ctx, "orders", f.row.ID)
	var o core.Order
	_ = json.Unmarshal(row.Data, &o)
	if o.Status != "refunded" {
		t.Fatal(o.Status)
	}
}
func TestInsufficientExternalRefundIsRetainedForReview(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if e := f.svc.Refresh(ctx, f.row.ID); e != nil {
		t.Fatal(e)
	}
	if _, e := f.svc.Billing.Adjust(ctx, "u", "consume", "tester", "test", -10000); e != nil {
		t.Fatal(e)
	}
	env, code := 1, 0
	event := Event{Name: "xpay_refund_notify", Env: &env, OpenID: "openid", RefundOrderID: f.row.ID, RefundID: "external-refund", RefundWXID: "refund-wx", PayWXID: f.remote.WXID, RefundFee: 100, RetCode: &code, RefundTime: time.Now().Unix()}
	if e := f.svc.Handle(ctx, event); e == nil {
		t.Fatal("must not falsely complete refund")
	}
	rows, _ := f.svc.Store.RecordPage(ctx, core.RecordQuery{Namespace: "virtual_payment_events", Status: "pending", Page: 1, Size: 20})
	if rows.Total != 1 {
		t.Fatal(rows)
	}
}
