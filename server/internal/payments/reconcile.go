package payments

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"log/slog"
	"time"
)

func Reconcile(ctx context.Context, s store.Store, p *Client, b *billing.Service) {
	if !p.Ready() {
		return
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			check, cancel := context.WithTimeout(ctx, 20*time.Second)
			reconcileOnce(check, s, p, b)
			cancel()
		}
	}
}
func reconcileOnce(ctx context.Context, s store.Store, p *Client, b *billing.Service) {
	for _, ns := range []string{"orders", "refunds"} {
		// Separate budgets prevent slow order queries from starving refunds.
		check, cancel := context.WithTimeout(ctx, 9*time.Second)
		reconcileBatch(check, s, ns, func(row core.Record) error {
			if ns == "refunds" {
				result, e := p.QueryRefund(check, row.ID)
				if e != nil {
					return e
				}
				return b.FinishRefund(check, result)
			}
			var o core.Order
			if e := json.Unmarshal(row.Data, &o); e != nil {
				return e
			}
			state, result, e := p.Query(check, row.ID)
			if e != nil {
				return e
			}
			if state == "SUCCESS" {
				e = b.Settle(check, result)
			} else if state == "CLOSED" {
				e = b.Close(check, row.ID)
			} else if !o.ExpiresAt.After(time.Now()) && state == "NOTPAY" {
				if e = p.Close(check, row.ID); e == nil {
					e = b.Close(check, row.ID)
				}
			}
			return e
		})
		cancel()
	}

}

type reconcileLease struct {
	Until time.Time `json:"until"`
	After string    `json:"after"`
}

func reconcileBatch(ctx context.Context, s store.Store, ns string, check func(core.Record) error) {
	var row core.Record
	var lease reconcileLease
	won := false
	err := s.Atomic(ctx, func(tx store.Transaction) error {
		var e error
		row, e = tx.Lock("leases", core.Record{ID: "payment-reconcile-" + ns, Data: core.Data(reconcileLease{})})
		if e != nil {
			return e
		}
		if e = json.Unmarshal(row.Data, &lease); e != nil {
			return e
		}
		if lease.Until.After(time.Now()) {
			return nil
		}
		lease.Until = time.Now().UTC().Add(25 * time.Second)
		row.Data = core.Data(lease)
		row, e = tx.Put("leases", row, row.Version)
		won = e == nil
		return e
	})
	if err != nil || !won {
		return
	}
	items, err := s.PendingPayments(ctx, ns, lease.After, 20)
	if err != nil {
		return
	}
	if len(items) == 0 {
		lease.After = ""
		row.Data = core.Data(lease)
		_, _ = s.Put(ctx, "leases", row, row.Version)
		return
	}
	for _, item := range items {
		if ctx.Err() != nil {
			return
		}
		// Advance before querying: even a permanently failing record cannot starve later ones.
		// The cursor wraps and revisits it; payment callbacks remain independently idempotent.
		lease.After = item.ID
		row.Data = core.Data(lease)
		row, err = s.Put(ctx, "leases", row, row.Version)
		if err != nil {
			return
		}
		if e := check(item); e != nil {
			slog.Warn("payment reconciliation pending", "kind", ns, "id", item.ID)
		}
	}
}
