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

func TestRefundAcceptedIsNotRefundCompleted(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if e := f.svc.Refresh(ctx, f.row.ID); e != nil {
		t.Fatal(e)
	}
	refundID := ""
	status := 5
	original := f.svc.Client.HTTP
	f.svc.Client.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(r.Body)
		var args map[string]any
		_ = json.Unmarshal(body, &args)
		if r.URL.Path == "/xpay/refund_order" {
			refundID = args["refund_order_id"].(string)
			if args["left_fee"] != float64(100) || args["refund_reason"] != "3" || args["req_from"] != "1" {
				t.Fatal(args)
			}
			return response(200, map[string]any{"errcode": 0, "refund_order_id": refundID, "refund_wx_order_id": "wx-refund", "pay_order_id": f.row.ID, "pay_wx_order_id": f.remote.WXID}), nil
		}
		if r.URL.Path == "/xpay/query_order" && args["wx_order_id"] == "wx-refund" {
			return response(200, map[string]any{"errcode": 0, "order": RemoteOrder{ID: refundID, WXID: "wx-refund", Env: 2, Type: 1, Status: status, RefundFee: 100, Meta: refundID, PaidTime: time.Now().Unix()}}), nil
		}
		// The fixture's normal query mock does not need the already-consumed body.
		r.Body = io.NopCloser(bytes.NewReader(body))
		return original.Do(r)
	})
	row, e := f.svc.StartRefund(ctx, f.row.ID, "测试退款", "admin")
	if e != nil {
		t.Fatal(e)
	}
	var refund core.Refund
	_ = json.Unmarshal(row.Data, &refund)
	if refund.Status != "processing" {
		t.Fatal(refund)
	}
	if e = f.svc.RefreshRefund(ctx, row.ID); e != nil {
		t.Fatal(e)
	}
	w, _ := f.svc.Billing.Wallet(ctx, "u")
	if w.Held != 10000 {
		t.Fatal("merchant debit released points", w)
	}
	status = 7
	if e = f.svc.RefreshRefund(ctx, row.ID); e != nil {
		t.Fatal(e)
	}
	abnormal := eventID(Event{Name: "refund_abnormal", RefundOrderID: f.row.ID, RefundID: row.ID})
	if _, e = f.svc.Store.Get(ctx, "virtual_payment_events", abnormal); e != nil {
		t.Fatal("abnormal refund not visible", e)
	}
	if e = f.svc.RetryEvent(ctx, abnormal, "admin"); e == nil {
		t.Fatal("abnormal refund shown as completed")
	}
	status = 8
	if e = f.svc.RefreshRefund(ctx, row.ID); e != nil {
		t.Fatal(e)
	}
	w, _ = f.svc.Billing.Wallet(ctx, "u")
	if w.Held != 0 || w.Available != 0 {
		t.Fatal(w)
	}
	if e = f.svc.RetryEvent(ctx, abnormal, "admin"); e != nil {
		t.Fatal(e)
	}
}
func TestAppleRefundCannotUseDeveloperRefundAPI(t *testing.T) {
	f := newFixture(t)
	f.remote.Type = 7
	if e := f.svc.Refresh(context.Background(), f.row.ID); e != nil {
		t.Fatal(e)
	}
	if _, e := f.svc.StartRefund(context.Background(), f.row.ID, "退款", "admin"); e == nil {
		t.Fatal("Apple refund allowed")
	}
	refunds, _ := f.svc.Store.List(context.Background(), "refunds", "")
	if len(refunds) != 0 {
		t.Fatal("blocked refund reserved funds")
	}
}
func TestAlreadyDeliveredRemoteDoesNotInventLocalCredit(t *testing.T) {
	for _, status := range []int{3, 4} {
		f := newFixture(t)
		f.remote.Status = status
		if e := f.svc.Refresh(context.Background(), f.row.ID); e == nil {
			t.Fatal("unexpected remote delivery accepted")
		}
		w, _ := f.svc.Billing.Wallet(context.Background(), "u")
		if w.Available != 0 {
			t.Fatal(w)
		}
	}
}
