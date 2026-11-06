package virtualpay

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestOutboxRecoveryContinuesAfterCreditAndProcessRestart(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.deliveryOK = false
	if e := f.svc.Refresh(ctx, f.row.ID); e == nil {
		t.Fatal("expected upstream outage")
	}
	f.deliveryOK = true
	restarted := &Service{Client: f.svc.Client, Store: f.svc.Store, Billing: f.svc.Billing}
	restarted.Reconcile(ctx)
	row, e := f.svc.Store.Get(ctx, "orders", f.row.ID)
	if e != nil {
		t.Fatal(e)
	}
	var order core.Order
	_ = json.Unmarshal(row.Data, &order)
	if !order.Virtual.Delivered {
		t.Fatal("outbox not recovered")
	}
	wallet, _ := f.svc.Billing.Wallet(ctx, "u")
	if wallet.Available != 10000 {
		t.Fatal(wallet)
	}
	before := f.deliveries
	restarted.Reconcile(ctx)
	if f.deliveries != before {
		t.Fatal("shared lease ignored")
	}
}

func TestCursorDoesNotSkipPendingRowsWhenEarlierRowsDisappear(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	for _, id := range []string{"a", "b", "c"} {
		_, e := f.svc.Store.Put(ctx, "virtual_deliveries", core.Record{ID: id, Data: core.Data(map[string]string{"status": "pending"})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	first, e := f.svc.Store.RecordPage(ctx, core.RecordQuery{Namespace: "virtual_deliveries", Status: "pending", Page: 1, Size: 2, ByID: true})
	if e != nil || len(first.Items) != 2 {
		t.Fatal(first, e)
	}
	for _, row := range first.Items {
		row.Data = core.Data(map[string]string{"status": "done"})
		if _, e = f.svc.Store.Put(ctx, "virtual_deliveries", row, row.Version); e != nil {
			t.Fatal(e)
		}
	}
	next, e := f.svc.Store.RecordPage(ctx, core.RecordQuery{Namespace: "virtual_deliveries", Status: "pending", Page: 1, Size: 2, ByID: true, AfterID: first.Items[1].ID})
	if e != nil || len(next.Items) != 1 || next.Items[0].ID != "c" {
		t.Fatal(next, e)
	}
}
