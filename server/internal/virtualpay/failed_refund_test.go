package virtualpay

import (
	"bytes"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"testing"
	"time"
)

// WeChat reports a refund as failed (status 7): the points held for it stay
// frozen until an administrator, having confirmed no money went back, closes
// it. Closing returns the points and makes the order paid again; a later
// "succeeded" from WeChat is refused rather than taking the points twice.
func TestFailedRefundCanBeClosedAndReturnsHeldPoints(t *testing.T) {
	f := newFixture(t)
	ctx := t.Context()
	if err := f.svc.Refresh(ctx, f.row.ID); err != nil { // paid, 10000 credited
		t.Fatal(err)
	}
	refundID, status := "", 7
	original := f.svc.Client.HTTP
	f.svc.Client.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(r.Body)
		var args map[string]any
		_ = json.Unmarshal(body, &args)
		if r.URL.Path == "/xpay/refund_order" {
			refundID = args["refund_order_id"].(string)
			return response(200, map[string]any{"errcode": 0, "refund_order_id": refundID, "refund_wx_order_id": "wx-refund", "pay_order_id": f.row.ID, "pay_wx_order_id": f.remote.WXID}), nil
		}
		if r.URL.Path == "/xpay/query_order" && args["wx_order_id"] == "wx-refund" {
			return response(200, map[string]any{"errcode": 0, "order": RemoteOrder{ID: refundID, WXID: "wx-refund", Env: 2, Type: 1, Status: status, RefundFee: 100, Meta: refundID, PaidTime: time.Now().Unix()}}), nil
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		return original.Do(r)
	})
	row, err := f.svc.StartRefund(ctx, f.row.ID, "测试退款", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if err = f.svc.Billing.CloseFailedRefund(ctx, row.ID); !errors.Is(err, billing.ErrRefundNotFailed) {
		t.Fatal("a refund still processing was closed", err)
	}
	if err = f.svc.RefreshRefund(ctx, row.ID); err != nil { // status 7: recorded as abnormal, for review
		t.Fatal(err)
	}
	refundRow, _ := f.svc.Store.Get(ctx, "refunds", row.ID)
	var refund core.Refund
	if json.Unmarshal(refundRow.Data, &refund) != nil || refund.Status != "abnormal" {
		t.Fatal("failed refund not recorded as abnormal", refund.Status)
	}
	if w, _ := f.svc.Billing.Wallet(ctx, "u"); w.Available != 0 || w.Held != 10000 {
		t.Fatal(w)
	}
	if err = f.svc.Billing.CloseFailedRefund(ctx, row.ID); err != nil {
		t.Fatal(err)
	}
	w, _ := f.svc.Billing.Wallet(ctx, "u")
	_, o, _ := f.svc.order(ctx, f.row.ID)
	if w.Available != 10000 || w.Held != 0 || o.Status != "paid" || o.RefundID != "" {
		t.Fatal("held points not returned", w, o.Status, o.RefundID)
	}
	// WeChat later says it refunded after all: refused, the points stay.
	status = 8
	if err = f.svc.RefreshRefund(ctx, row.ID); !errors.Is(err, core.ErrConflict) {
		t.Fatal("a closed refund was completed later", err)
	}
	if w, _ = f.svc.Billing.Wallet(ctx, "u"); w.Available != 10000 || w.Held != 0 {
		t.Fatal("points taken after the refund was closed", w)
	}
}
