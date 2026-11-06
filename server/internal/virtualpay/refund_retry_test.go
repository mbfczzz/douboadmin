package virtualpay

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"
)

func TestUnknownRefundSubmissionQueriesOriginalBeforeRetry(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if e := f.svc.Refresh(ctx, f.row.ID); e != nil {
		t.Fatal(e)
	}
	original := f.svc.Client.HTTP
	submissions, refundID := 0, ""
	f.svc.Client.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(r.Body)
		var args map[string]any
		_ = json.Unmarshal(body, &args)
		if r.URL.Path == "/xpay/refund_order" {
			submissions++
			refundID = args["refund_order_id"].(string)
			return response(503, nil), nil // Accepted remotely, response lost locally.
		}
		if r.URL.Path == "/xpay/query_order" && refundID != "" && args["order_id"] == refundID {
			return response(200, map[string]any{"errcode": 0, "order": RemoteOrder{ID: refundID, WXID: "refund-wx", Env: 2, Type: 1, Status: 8, RefundFee: 100, Meta: refundID, PaidTime: time.Now().Unix()}}), nil
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		return original.Do(r)
	})
	if _, e := f.svc.StartRefund(ctx, f.row.ID, "退款", "admin"); e == nil {
		t.Fatal("expected uncertain submission")
	}
	w, _ := f.svc.Billing.Wallet(ctx, "u")
	if w.Held != 10000 {
		t.Fatal(w)
	}
	rows, _ := f.svc.Store.List(ctx, "virtual_payment_events", "")
	if len(rows) != 1 {
		t.Fatal(rows)
	}
	for range 2 {
		if e := f.svc.RetryEvent(ctx, rows[0].ID, "admin"); e != nil {
			t.Fatal(e)
		}
	}
	w, _ = f.svc.Billing.Wallet(ctx, "u")
	if submissions != 1 || w.Held != 0 || w.Available != 0 {
		t.Fatal(submissions, w)
	}
	row, _ := f.svc.Store.Get(ctx, "virtual_payment_events", rows[0].ID)
	var event PaymentEvent
	_ = json.Unmarshal(row.Data, &event)
	if event.Status != "done" {
		t.Fatal(event)
	}
}

func TestWrongTransactionRefundNeverSubmitted(t *testing.T) {
	f := newFixture(t)
	if e := f.svc.Refresh(t.Context(), f.row.ID); e != nil {
		t.Fatal(e)
	}
	_, o, _ := f.svc.order(t.Context(), f.row.ID)
	f.remote.WXID = "wrong"
	if _, e := f.svc.Client.Refund(t.Context(), "refund-id", core.Refund{AmountFen: 100}, o, f.remote); e != core.ErrPaymentMismatch {
		t.Fatal(e)
	}
}

func TestRefundReservationPersistsSubmissionBeforeAnyNetworkCall(t *testing.T) {
	f := newFixture(t)
	if e := f.svc.Refresh(t.Context(), f.row.ID); e != nil {
		t.Fatal(e)
	}
	// Simulate a process stopping after reservation, before the API call.
	row, e := f.svc.Billing.StartRefund(t.Context(), f.row.ID, "退款", "admin")
	if e != nil {
		t.Fatal(e)
	}
	event, e := f.svc.Store.Get(t.Context(), "virtual_payment_events", core.RefundSubmissionEventID(f.row.ID, row.ID))
	if e != nil {
		t.Fatal("held points have no durable recovery work", e)
	}
	var pending PaymentEvent
	_ = json.Unmarshal(event.Data, &pending)
	if pending.Status != "pending" || pending.RefundID != row.ID || pending.OrderID != f.row.ID {
		t.Fatal(pending)
	}
	wallet, _ := f.svc.Billing.Wallet(t.Context(), "u")
	if wallet.Held != 10000 {
		t.Fatal(wallet)
	}
}
