package billing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

func (s *Service) StartRefund(ctx context.Context, orderID, reason, actor string) (out core.Record, err error) {
	base, err := s.Store.Get(ctx, "orders", orderID)
	if err != nil {
		return out, err
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, base.Owner); e != nil {
			return e
		}
		row, e := tx.Get("orders", orderID)
		if e != nil {
			return e
		}
		var order core.Order
		if e = json.Unmarshal(row.Data, &order); e != nil {
			return e
		}
		if order.RefundID != "" {
			out, e = tx.Get("refunds", order.RefundID)
			return e
		}
		if order.Status != "paid" {
			return fmt.Errorf("仅已支付订单可退款")
		}
		id := core.NewID()
		if _, e = store.ApplyFunds(tx, core.LedgerEntry{UserID: order.UserID, Reference: "refund:" + id + ":hold", Kind: "refund_hold", AvailableDelta: -order.PointsUnits, HeldDelta: order.PointsUnits, Actor: actor, Note: reason}); e != nil {
			return e
		}
		if e = partners.HoldCommissionRefund(tx, orderID, id, order); e != nil {
			return e
		}
		refund := core.Refund{OrderID: orderID, UserID: order.UserID, AmountFen: order.AmountFen, PointsUnits: order.PointsUnits, Status: "pending", Reason: reason}
		out, e = tx.Put("refunds", core.Record{ID: id, Owner: order.UserID, Data: core.Data(refund)}, 0)
		if e != nil {
			return e
		}
		order.Status = "refunding"
		order.RefundID = id
		row.Data = core.Data(order)
		_, e = tx.Put("orders", row, row.Version)
		return e
	})
	return
}

type RefundResult struct {
	ID, OrderID, ProviderID, Status string
	AmountFen                       int64
	CompletedAt                     time.Time
}

func (s *Service) FinishRefund(ctx context.Context, result RefundResult) error {
	base, err := s.Store.Get(ctx, "refunds", result.ID)
	if err != nil {
		return err
	}
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, base.Owner); e != nil {
			return e
		}
		row, e := tx.Get("refunds", result.ID)
		if e != nil {
			return e
		}
		var refund core.Refund
		if e = json.Unmarshal(row.Data, &refund); e != nil {
			return e
		}
		if refund.OrderID != result.OrderID || refund.AmountFen != result.AmountFen {
			return core.ErrPaymentMismatch
		}
		if refund.Status == "succeeded" {
			if result.Status == "SUCCESS" && (refund.ProviderID == "" || refund.ProviderID == result.ProviderID) {
				return nil
			}
			return core.ErrConflict
		}
		if refund.Status == "closed" {
			if result.Status == "CLOSED" {
				return nil
			}
			return core.ErrConflict
		}
		refund.ProviderID = result.ProviderID
		if result.Status == "PROCESSING" || result.Status == "ABNORMAL" {
			refund.Status = "processing"
			if result.Status == "ABNORMAL" {
				refund.Status = "abnormal"
			}
			row.Data = core.Data(refund)
			_, e = tx.Put("refunds", row, row.Version)
			return e
		}
		if result.Status != "SUCCESS" && result.Status != "CLOSED" {
			return fmt.Errorf("未知退款状态")
		}
		orderRow, e := tx.Get("orders", refund.OrderID)
		if e != nil {
			return e
		}
		var order core.Order
		if e = json.Unmarshal(orderRow.Data, &order); e != nil {
			return e
		}
		if order.RefundID != row.ID {
			return core.ErrConflict
		}
		entry := core.LedgerEntry{UserID: refund.UserID, Reference: "refund:" + row.ID + ":settle", Kind: "refund_complete", HeldDelta: -refund.PointsUnits, Note: "微信退款完成，回收充值积分"}
		refund.Status = "succeeded"
		order.Status = "refunded"
		if result.Status == "CLOSED" {
			refund.Status = "closed"
			order.Status = "paid"
			order.RefundID = ""
			entry.Kind = "refund_cancel"
			entry.AvailableDelta = refund.PointsUnits
			entry.Note = "退款关闭，恢复可用积分"
		}
		if _, e = store.ApplyFunds(tx, entry); e != nil {
			return e
		}
		if e = partners.FinishCommissionRefund(tx, refund.OrderID, row.ID, order, result.Status == "SUCCESS"); e != nil {
			return e
		}
		refund.CompletedAt = &result.CompletedAt
		row.Data = core.Data(refund)
		orderRow.Data = core.Data(order)
		if _, e = tx.Put("orders", orderRow, orderRow.Version); e != nil {
			return e
		}
		_, e = tx.Put("refunds", row, row.Version)
		return e
	})
}

// SetPrepay never changes financial state. Duplicate calls keep the original prepay id.
func (s *Service) SetPrepay(ctx context.Context, id, prepayID string) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		r, e := tx.Get("orders", id)
		if e != nil {
			return e
		}
		var o core.Order
		if e = json.Unmarshal(r.Data, &o); e != nil {
			return e
		}
		if o.Status != "created" {
			return nil
		}
		if o.PrepayID != "" && o.PrepayID != prepayID {
			return core.ErrConflict
		}
		o.PrepayID = prepayID
		r.Data = core.Data(o)
		_, e = tx.Put("orders", r, r.Version)
		return e
	})
}

func (s *Service) Close(ctx context.Context, id string) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		r, e := tx.Get("orders", id)
		if errors.Is(e, core.ErrNotFound) {
			return e
		}
		if e != nil {
			return e
		}
		var o core.Order
		if e = json.Unmarshal(r.Data, &o); e != nil {
			return e
		}
		if o.Status != "created" {
			return nil
		}
		o.Status = "closed"
		r.Data = core.Data(o)
		_, e = tx.Put("orders", r, r.Version)
		return e
	})
}
