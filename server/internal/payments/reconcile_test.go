package payments

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"
)

func TestReconciliationAdvancesPastFailuresAndWraps(t *testing.T) {
	ctx := context.Background()
	s := store.NewMemory()
	for i := range 25 {
		_, e := s.Put(ctx, "orders", core.Record{ID: fmt.Sprintf("order-%02d", i), Data: core.Data(core.Order{Status: "created"})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	seen := map[string]int{}
	check := func(r core.Record) error { seen[r.ID]++; return errors.New("upstream timeout") }
	reconcileBatch(ctx, s, "orders", check)
	if len(seen) != 20 {
		t.Fatal(len(seen))
	}
	reconcileBatch(ctx, s, "orders", check)
	if len(seen) != 20 {
		t.Fatal("shared lease allowed duplicate polling")
	}
	for range 3 {
		row, e := s.Get(ctx, "leases", "payment-reconcile-orders")
		if e != nil {
			t.Fatal(e)
		}
		var lease reconcileLease
		if e = json.Unmarshal(row.Data, &lease); e != nil {
			t.Fatal(e)
		}
		lease.Until = time.Time{}
		row.Data = core.Data(lease)
		if _, e = s.Put(ctx, "leases", row, row.Version); e != nil {
			t.Fatal(e)
		}
		reconcileBatch(ctx, s, "orders", check)
	}
	if len(seen) != 25 || seen["order-00"] != 2 || seen["order-24"] != 1 {
		t.Fatal(seen)
	}
}
