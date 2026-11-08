package virtualpay

import (
	"doubo/server/internal/core"
	"testing"
)

func TestReconciliationRejectsCorruptVirtualSnapshotsBeforeCrediting(t *testing.T) {
	for _, field := range []string{"quantity", "points", "owner"} {
		f := newFixture(t)
		order := f.order
		if field == "quantity" {
			order.Virtual.Quantity, order.Virtual.UnitFen = 2, 60
		} else if field == "points" {
			order.Virtual.PointsUnits++
		} else {
			order.UserID = "different-owner"
		}
		if _, err := f.svc.Store.Put(t.Context(), "orders", core.Record{
			ID: f.row.ID, Owner: "u", Data: core.Data(order)}, f.row.Version); err != nil {
			t.Fatal(err)
		}
		if err := f.svc.Refresh(t.Context(), f.row.ID); err == nil {
			t.Fatal("corrupt snapshot credited by query fallback", field)
		}
		wallet, _ := f.svc.Billing.Wallet(t.Context(), "u")
		entries, _ := f.svc.Store.List(t.Context(), "wallet_ledger", "u")
		if wallet.Available != 0 || wallet.Held != 0 || len(entries) != 0 {
			t.Fatal("corrupt order changed the wallet", field, wallet, len(entries))
		}
	}
}
