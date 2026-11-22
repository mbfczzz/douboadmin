package api

import (
	"doubo/server/internal/core"
	"testing"
)

// Closing a failed refund needs the administrator's confirmation and a
// reason, and applies only to a refund WeChat reported as failed.
func TestClosingAFailedRefundNeedsConfirmationAndAFailedRefund(t *testing.T) {
	a, _, user := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	_, _ = a.Store.Put(t.Context(), "refunds", core.Record{ID: "r1", Owner: "user-a", Data: core.Data(core.Refund{Channel: "wechat_virtual", OrderID: "o1", UserID: "user-a", AmountFen: 100, PointsUnits: 10000, Status: "processing"})}, 0)
	path := "/api/admin/refunds/r1/close"
	if w := call(a, "POST", path, user, "", map[string]any{"verified": true, "reason": "已核实退款未成功"}); w.Code != 403 && w.Code != 401 {
		t.Fatal("a user closed a refund", w.Code)
	}
	if w := call(a, "POST", path, admin, "", map[string]any{"verified": false, "reason": "已核实退款未成功"}); w.Code != 400 {
		t.Fatal("closed without confirmation", w.Code)
	}
	if w := call(a, "POST", path, admin, "", map[string]any{"verified": true, "reason": "短"}); w.Code != 400 {
		t.Fatal("closed without a reason", w.Code)
	}
	if w := call(a, "POST", path, admin, "", map[string]any{"verified": true, "reason": "已核实退款未成功"}); w.Code != 409 {
		t.Fatal("closed a refund that has not failed", w.Code, w.Body.String())
	}
}
