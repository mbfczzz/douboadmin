package virtualpay

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
	"time"
)

func TestRefundPreflightDoesNotFreezePoints(t *testing.T) {
	for _, scenario := range []string{"insufficient", "wrong-transaction", "closed"} {
		t.Run(scenario, func(t *testing.T) {
			f := newFixture(t)
			ctx := context.Background()
			if e := f.svc.Refresh(ctx, f.row.ID); e != nil {
				t.Fatal(e)
			}
			switch scenario {
			case "insufficient":
				f.remote.Left = 0
			case "wrong-transaction":
				f.remote.WXID = "another-transaction"
			case "closed":
				f.remote.Status = 6
			}
			if _, e := f.svc.StartRefund(ctx, f.row.ID, "review", "admin"); e == nil {
				t.Fatal("invalid refund accepted")
			}
			w, _ := f.svc.Billing.Wallet(ctx, "u")
			_, order, _ := f.svc.order(ctx, f.row.ID)
			refunds, _ := f.svc.Store.List(ctx, "refunds", "")
			if w.Available != 10000 || w.Held != 0 || order.Status != "paid" || len(refunds) != 0 {
				t.Fatalf("preflight mutated funds: %+v %+v", w, order)
			}
		})
	}
}

func refundEvent(f *fixture) Event {
	env, code := 1, 0
	return Event{Name: "xpay_refund_notify", Env: &env, OpenID: "openid", RefundOrderID: f.row.ID,
		RefundID: "external-refund", RefundWXID: "refund-wx", PayWXID: f.remote.WXID,
		RefundFee: 100, RetCode: &code, RefundTime: time.Now().Unix()}
}

func TestEarlyRefundRetainedAndReconciledExactlyOnce(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	event := refundEvent(f)
	if e := f.svc.Handle(ctx, event); e == nil {
		t.Fatal("unsettled order should wait for reconciliation")
	}
	row, e := f.svc.Store.Get(ctx, "virtual_payment_events", eventID(event))
	if e != nil {
		t.Fatal(e)
	}
	var stored PaymentEvent
	_ = json.Unmarshal(row.Data, &stored)
	if stored.Status != "pending" || stored.Message == nil || stored.LastError == "" {
		t.Fatal(stored)
	}
	// An intervening verified payment query settles the order, then the inbox retries.
	if e = f.svc.Refresh(ctx, f.row.ID); e != nil {
		t.Fatal(e)
	}
	f.svc.Reconcile(ctx)
	if e = f.svc.RetryEvent(ctx, row.ID, "admin"); e != nil {
		t.Fatal(e)
	}
	if e = f.svc.Handle(ctx, event); e != nil {
		t.Fatal(e)
	}
	w, _ := f.svc.Billing.Wallet(ctx, "u")
	_, order, _ := f.svc.order(ctx, f.row.ID)
	ledger, _ := f.svc.Store.List(ctx, "wallet_ledger", "u")
	if w.Available != 0 || w.Held != 0 || order.Status != "refunded" || len(ledger) != 3 {
		t.Fatal(w, order, len(ledger))
	}
}

func TestManualReviewRequiresVersionAndDoesNotChangeFunds(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	event := refundEvent(f)
	_ = f.svc.Handle(ctx, event)
	row, _ := f.svc.Store.Get(ctx, "virtual_payment_events", eventID(event))
	if e := f.svc.ReviewEvent(ctx, row.ID, row.Version, "", "admin"); e == nil {
		t.Fatal("empty review accepted")
	}
	if e := f.svc.ReviewEvent(ctx, row.ID, row.Version-1, "已核对", "admin"); e != core.ErrConflict {
		t.Fatal(e)
	}
	if e := f.svc.ReviewEvent(ctx, row.ID, row.Version, "已核对微信记录，待线下处理", "admin"); e != nil {
		t.Fatal(e)
	}
	f.svc.Reconcile(ctx)
	w, _ := f.svc.Billing.Wallet(ctx, "u")
	_, order, _ := f.svc.order(ctx, f.row.ID)
	// Reconcile may settle the mock paid order, but review itself never refunds it.
	if w.Available != 10000 || w.Held != 0 || order.Status != "paid" {
		t.Fatal(w, order)
	}
	row, _ = f.svc.Store.Get(ctx, "virtual_payment_events", row.ID)
	var record PaymentEvent
	_ = json.Unmarshal(row.Data, &record)
	if record.Status != "reviewed" || record.Actor != "admin" || record.Note == "" {
		t.Fatal(record)
	}
}

func TestComplaintRetryKeepsOriginalEventIdentity(t *testing.T) {
	f := newFixture(t)
	event := Event{Name: "xpay_complaint_notify", Fingerprint: "message-fingerprint", Payload: `{"Event":"xpay_complaint_notify"}`}
	if e := f.svc.Handle(t.Context(), event); e != nil {
		t.Fatal(e)
	}
	if e := f.svc.RetryEvent(t.Context(), eventID(event), "admin"); e != nil {
		t.Fatal(e)
	}
	rows, _ := f.svc.Store.List(t.Context(), "virtual_payment_events", "")
	if len(rows) != 1 || rows[0].ID != eventID(event) {
		t.Fatal("retry duplicated complaint", rows)
	}
}
