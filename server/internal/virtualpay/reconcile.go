package virtualpay

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"log/slog"
	"time"
)

type scanLease struct {
	Until time.Time         `json:"until"`
	After map[string]string `json:"after"`
}

func (s *Service) Run(ctx context.Context) {
	if !s.Ready() {
		return
	}
	timer := time.NewTicker(30 * time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			check, cancel := context.WithTimeout(ctx, 20*time.Second)
			s.Reconcile(check)
			cancel()
		}
	}
}
func (s *Service) Reconcile(ctx context.Context) {
	var record core.Record
	var lease scanLease
	won := false
	e := s.Store.Atomic(ctx, func(tx store.Transaction) error {
		var err error
		record, err = tx.Lock("leases", core.Record{ID: "virtual-payment-reconcile", Data: core.Data(scanLease{})})
		if err != nil {
			return err
		}
		if err = json.Unmarshal(record.Data, &lease); err != nil {
			return err
		}
		if lease.Until.After(time.Now()) {
			return nil
		}
		lease.Until = time.Now().UTC().Add(25 * time.Second)
		if lease.After == nil {
			lease.After = map[string]string{}
		}
		record.Data = core.Data(lease)
		record, err = tx.Put("leases", record, record.Version)
		won = err == nil
		return err
	})
	if e != nil || !won {
		return
	}
	for _, ns := range []string{"orders", "virtual_deliveries", "refunds", "virtual_payment_events"} {
		if ctx.Err() != nil {
			return
		}
		status := ""
		if ns == "orders" {
			status = "created"
		}
		if ns == "virtual_deliveries" || ns == "virtual_payment_events" {
			status = "pending"
		}
		batch, err := s.Store.RecordPage(ctx, core.RecordQuery{Namespace: ns, Status: status, Page: 1, Size: 5, ByID: true, AfterID: lease.After[ns]})
		if err != nil {
			continue
		}
		if len(batch.Items) > 0 {
			lease.After[ns] = batch.Items[len(batch.Items)-1].ID
		} else {
			lease.After[ns] = ""
		}
		record.Data = core.Data(lease)
		record, err = s.Store.Put(ctx, "leases", record, record.Version)
		if err != nil {
			return
		}
		for _, row := range batch.Items {
			if ctx.Err() != nil {
				return
			}
			switch ns {
			case "virtual_payment_events":
				err = s.RetryEvent(ctx, row.ID, "reconcile")
			case "orders":
				var order core.Order
				if json.Unmarshal(row.Data, &order) != nil || order.Channel != Channel || UnissuedPurchase(order) {
					continue
				}
				err = s.Refresh(ctx, row.ID)
			case "virtual_deliveries":
				err = s.Refresh(ctx, row.ID)
			case "refunds":
				var refund core.Refund
				if json.Unmarshal(row.Data, &refund) != nil || refund.Channel != Channel || refund.Status == "succeeded" || refund.Status == "closed" {
					continue
				}
				err = s.RefreshRefund(ctx, row.ID)
			}
			if err != nil {
				slog.Warn("virtual payment reconciliation pending", "kind", ns, "id", row.ID, "error", err)
			}
		}
	}
}
