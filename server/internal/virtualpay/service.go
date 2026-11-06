package virtualpay

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"time"
)

type Service struct {
	Client  *Client
	Store   store.Store
	Billing *billing.Service
}

func (s *Service) Ready() bool   { return s != nil && s.Client.Ready() }
func (s *Service) Enabled() bool { return s != nil && s.Client.Enabled() }
func (s *Service) order(ctx context.Context, id string) (core.Record, core.Order, error) {
	row, e := s.Store.Get(ctx, "orders", id)
	var o core.Order
	if e == nil {
		e = json.Unmarshal(row.Data, &o)
	}
	if e == nil && (o.Channel != Channel || o.Virtual == nil || !s.Client.Config.Configured(o.Virtual.Env) || o.AppID != s.Client.Config.AppID || o.MerchantID != s.Client.Config.OfferID) {
		e = core.ErrPaymentMismatch
	}
	return row, o, e
}
func (s *Service) Refresh(ctx context.Context, id string) error {
	if !s.Ready() {
		return fmt.Errorf("虚拟支付尚未配置")
	}
	_, o, e := s.order(ctx, id)
	if e != nil {
		return e
	}
	remote, e := s.Client.Query(ctx, id, o)
	if e != nil {
		return e
	}
	if remote.Status == 6 {
		return s.Billing.Close(ctx, id)
	}
	if remote.Status != 2 && remote.Status != 3 && remote.Status != 4 {
		return nil
	}
	if remote.Status != 2 && o.Status != "paid" && o.Status != "refunding" && o.Status != "refunded" {
		return fmt.Errorf("微信发货状态与本地订单不一致，请人工核对")
	}
	if remote.Paid != o.AmountFen || remote.WXID == "" || remote.PaidTime <= 0 {
		return core.ErrPaymentMismatch
	}
	platform := "wechat"
	if remote.Type == 7 {
		platform = "ios"
	}
	e = s.Billing.Settle(ctx, billing.PaymentResult{Channel: Channel, Platform: platform, OrderID: id, TransactionID: remote.WXID, AppID: o.AppID, MerchantID: o.MerchantID, OpenID: o.OpenID, Currency: "CNY", AmountFen: remote.Paid, PaidAt: time.Unix(remote.PaidTime, 0).UTC()})
	if e != nil {
		return e
	}
	// Credit commit precedes acknowledgement. Retries are safe and driven by the outbox.
	if remote.Status != 4 {
		if e = s.Client.Deliver(ctx, id, o); e != nil {
			return e
		}
	}
	return s.markDelivered(ctx, id)
}
func (s *Service) markDelivered(ctx context.Context, id string) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		r, e := tx.Get("orders", id)
		if e != nil {
			return e
		}
		var o core.Order
		if e = json.Unmarshal(r.Data, &o); e != nil {
			return e
		}
		if o.Virtual == nil {
			return core.ErrPaymentMismatch
		}
		if !o.Virtual.Delivered {
			o.Virtual.Delivered = true
			r.Data = core.Data(o)
			if _, e = tx.Put("orders", r, r.Version); e != nil {
				return e
			}
		}
		pending, e := tx.Get("virtual_deliveries", id)
		if e != nil {
			return e
		}
		pending.Data = core.Data(map[string]string{"status": "done"})
		_, e = tx.Put("virtual_deliveries", pending, pending.Version)
		return e
	})
}

// Issuing a signed order is a one-way transition: never reuse its outTradeNo.
func (s *Service) ClaimSignature(ctx context.Context, id string) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		r, e := tx.Lock("orders", core.Record{ID: id})
		if e != nil {
			return e
		}
		var o core.Order
		if json.Unmarshal(r.Data, &o) != nil || o.Virtual == nil || o.Status != "created" || !o.ExpiresAt.After(time.Now()) {
			return core.ErrConflict
		}
		if o.Virtual.Issued {
			return fmt.Errorf("%w: 支付单号已使用，请查询结果或创建新订单", core.ErrConflict)
		}
		o.Virtual.Issued = true
		r.Data = core.Data(o)
		_, e = tx.Put("orders", r, r.Version)
		return e
	})
}
func (s *Service) StartRefund(ctx context.Context, id, reason, actor string) (core.Record, error) {
	if !s.Ready() {
		return core.Record{}, fmt.Errorf("虚拟支付尚未配置")
	}
	_, o, e := s.order(ctx, id)
	if e != nil {
		return core.Record{}, e
	}
	paid, e := s.Client.Query(ctx, id, o)
	if e != nil {
		return core.Record{}, e
	}
	if paid.Type == 7 {
		return core.Record{}, fmt.Errorf("Apple 订单请由用户在 App Store 申请退款")
	}
	// Validate before reserving any points. Unknown upstream outcomes after submission
	// must retain the same refund id and hold until reconciled.
	if o.RefundID == "" {
		if paid.WXID == "" || paid.WXID != o.TransactionID || paid.Paid != o.AmountFen {
			return core.Record{}, core.ErrPaymentMismatch
		}
		if paid.Status != 2 && paid.Status != 3 && paid.Status != 4 {
			return core.Record{}, fmt.Errorf("微信订单当前不可申请退款，请先核对状态")
		}
		if paid.Left < o.AmountFen {
			return core.Record{}, fmt.Errorf("微信剩余可退金额不足，请核对退款记录")
		}
	}
	r, e := s.Billing.StartRefund(ctx, id, reason, actor)
	if e != nil {
		return r, e
	}
	var refund core.Refund
	if e = json.Unmarshal(r.Data, &refund); e != nil {
		return r, e
	}
	if refund.ProviderOrderID != "" || refund.Status == "succeeded" {
		return r, nil
	}
	wxid, e := s.Client.Refund(ctx, r.ID, refund, o, paid)
	if e != nil {
		if auditErr := s.recordRefundIssue(ctx, id, r.ID, e); auditErr != nil {
			return r, fmt.Errorf("退款结果未确认，异常记录保存失败：%w", auditErr)
		}
		return r, e
	}
	e = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		row, err := tx.Get("refunds", r.ID)
		if err != nil {
			return err
		}
		var current core.Refund
		if err = json.Unmarshal(row.Data, &current); err != nil {
			return err
		}
		if current.ProviderOrderID != "" && current.ProviderOrderID != wxid {
			return core.ErrPaymentMismatch
		}
		current.ProviderOrderID = wxid
		if current.Status == "pending" {
			current.Status = "processing"
		}
		row.Data = core.Data(current)
		r, err = tx.Put("refunds", row, row.Version)
		return err
	})
	if e == nil {
		e = s.audit(ctx, Event{Name: "refund_submission", RefundOrderID: id, RefundID: r.ID, RefundFee: refund.AmountFen}, "done")
	}
	return r, e
}
func (s *Service) RefreshRefund(ctx context.Context, id string) error {
	row, e := s.Store.Get(ctx, "refunds", id)
	if e != nil {
		return e
	}
	var refund core.Refund
	if e = json.Unmarshal(row.Data, &refund); e != nil {
		return e
	}
	_, o, e := s.order(ctx, refund.OrderID)
	if e != nil {
		return e
	}
	r, e := s.Client.QueryRefund(ctx, id, refund, o)
	if e != nil {
		return e
	}
	// Status 5 is merchant-side debit, NOT the completed user-side refund.
	state := "PROCESSING"
	if r.Status == 8 {
		state = "SUCCESS"
	} else if r.Status == 7 {
		state = "ABNORMAL"
	}
	if state == "SUCCESS" && r.PaidTime <= 0 {
		return core.ErrPaymentMismatch
	}
	if e = s.Billing.FinishRefund(ctx, billing.RefundResult{Channel: Channel, ID: id, OrderID: refund.OrderID, ProviderID: r.WXID, AmountFen: refund.AmountFen, Status: state, CompletedAt: time.Unix(r.PaidTime, 0).UTC()}); e != nil {
		return e
	}
	if state == "ABNORMAL" {
		event := Event{Name: "refund_abnormal", RefundOrderID: refund.OrderID, RefundID: id, RefundFee: refund.AmountFen}
		if e = s.audit(ctx, event, "needs_review"); e != nil {
			return e
		}
		return s.eventError(ctx, eventID(event), fmt.Errorf("微信退款异常，请人工核对"))
	}
	return nil
}
