package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
	"encoding/json"
	"testing"
)

func TestVirtualEventActionsRequireAdminAndVersion(t *testing.T) {
	a, user, _ := virtualFixture(t)
	row, e := a.Store.Put(t.Context(), "virtual_payment_events", core.Record{ID: "event-one", Data: core.Data(virtualpay.PaymentEvent{Event: "xpay_complaint_notify", Status: "needs_review"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	for _, action := range []string{"review", "retry"} {
		if w := call(a, "POST", "/api/admin/virtual-payments/events/"+row.ID+"/"+action, user, "", map[string]any{"version": row.Version, "note": "测试"}); w.Code != 403 {
			t.Fatal(w.Code)
		}
	}
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	path := "/api/admin/virtual-payments/events/" + row.ID + "/review"
	if w := call(a, "POST", path, admin, "", map[string]any{"version": row.Version, "note": ""}); w.Code != 400 {
		t.Fatal(w.Code)
	}
	if w := call(a, "POST", path, admin, "", map[string]any{"version": row.Version - 1, "note": "已核对"}); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "POST", path, admin, "", map[string]any{"version": row.Version, "note": "已核对平台记录"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	updated, _ := a.Store.Get(t.Context(), "virtual_payment_events", row.ID)
	var record virtualpay.PaymentEvent
	_ = json.Unmarshal(updated.Data, &record)
	if record.Actor != adminID("admin") || record.Status != "reviewed" {
		t.Fatal(record)
	}
}
