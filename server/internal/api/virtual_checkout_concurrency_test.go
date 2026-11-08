package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"sync"
	"testing"
)

func TestConcurrentCustomCheckoutCreatesOnlyOneUnpaidOrder(t *testing.T) {
	a, user := customFixture(t)
	var group sync.WaitGroup
	for range 12 {
		group.Go(func() {
			w := call(a, "POST", "/api/orders", user, "parallel-custom-checkout", map[string]any{
				"purchaseMode": "custom", "amountFen": 500, "settingsVersion": 1, "platform": "android"})
			var row core.Record
			if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
				t.Error(w.Code, w.Body.String())
				return
			}
			var order core.Order
			if json.Unmarshal(row.Data, &order) != nil || order.AmountFen != 500 || order.PointsUnits != 50000 || order.Virtual.Quantity != 5 {
				t.Error("invalid concurrent order", order)
			}
		})
	}
	group.Wait()
	orders, _ := a.Store.List(t.Context(), "orders", "user-a")
	ledger, _ := a.Store.List(t.Context(), "wallet_ledger", "user-a")
	wallet, _ := a.Billing.Wallet(t.Context(), "user-a")
	if len(orders) != 1 || len(ledger) != 0 || wallet.Available != 0 || wallet.Held != 0 {
		t.Fatal("concurrent creation duplicated an order or issued credit", len(orders), len(ledger), wallet)
	}
}
