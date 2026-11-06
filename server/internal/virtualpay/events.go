package virtualpay

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"time"
)

func (s *Service) Handle(ctx context.Context, event Event) error {
	// Called only after message authentication. Persist before business validation:
	// a valid notification may arrive before our payment transaction commits.
	if e := s.audit(ctx, event, "pending"); e != nil {
		return e
	}
	e := s.processEvent(ctx, event)
	if e != nil {
		if saveErr := s.eventError(ctx, eventID(event), e); saveErr != nil {
			return saveErr
		}
	}
	return e
}

func (s *Service) processEvent(ctx context.Context, event Event) error {
	if event.Name == "xpay_goods_deliver_notify" {
		_, o, e := s.order(ctx, event.OrderID)
		if e != nil {
			return e
		}
		g := event.Goods
		if event.Env == nil || *event.Env != o.Virtual.Env || event.OpenID != o.OpenID || g == nil || g.ProductID != o.Virtual.ProductID || g.Quantity != 1 || g.OrigPrice != o.AmountFen || g.ActualPrice != o.AmountFen || g.Attach != event.OrderID {
			return core.ErrPaymentMismatch
		}
		if e = s.Refresh(ctx, event.OrderID); e != nil {
			return e
		}
		_, confirmed, e := s.order(ctx, event.OrderID)
		if e != nil {
			return e
		}
		if !confirmed.Virtual.Delivered {
			return fmt.Errorf("支付发货尚未确认")
		}
		return s.audit(ctx, event, "done")
	}
	if event.Name == "xpay_refund_notify" {
		return s.handleRefund(ctx, event)
	}
	if event.Name == "xpay_complaint_notify" || event.Name == "xpay_wxpay_callback_notify" {
		return s.audit(ctx, event, "needs_review")
	}
	return fmt.Errorf("未支持的虚拟支付事件")
}
func (s *Service) handleRefund(ctx context.Context, event Event) error {
	_, o, e := s.order(ctx, event.RefundOrderID)
	if e != nil {
		return e
	}
	if event.Env == nil || *event.Env != o.Virtual.Env || event.OpenID != o.OpenID || event.RetCode == nil || event.RefundID == "" || event.RefundWXID == "" || event.PayWXID != o.TransactionID || event.RefundFee <= 0 || event.RefundFee > o.AmountFen {
		return core.ErrPaymentMismatch
	}
	if e = s.audit(ctx, event, "pending"); e != nil {
		return e
	}
	if *event.RetCode != 0 {
		return s.audit(ctx, event, "failed")
	}
	if event.RefundFee != o.AmountFen {
		return fmt.Errorf("部分退款需要人工核对积分回收")
	}
	if event.RefundTime <= 0 {
		return core.ErrPaymentMismatch
	}
	// External/Apple refunds are never assumed to have enough reclaimable points.
	// Insufficient balance stays visibly pending for manual handling and platform retries.
	if o.RefundID == "" {
		row, err := s.Billing.StartExternalRefund(ctx, event.RefundOrderID, "微信平台外部退款", "wechat_virtual")
		if err != nil {
			return err
		}
		o.RefundID = row.ID
	}
	row, e := s.Store.Get(ctx, "refunds", o.RefundID)
	if e != nil {
		return e
	}
	var refund core.Refund
	if e = json.Unmarshal(row.Data, &refund); e != nil {
		return e
	}
	if refund.ProviderOrderID != "" && refund.ProviderOrderID != event.RefundWXID {
		return core.ErrPaymentMismatch
	}
	// For an API-initiated refund, the merchant id must also match our request id.
	if refund.Reason != "微信平台外部退款" && event.RefundID != row.ID {
		return core.ErrPaymentMismatch
	}
	e = s.Billing.FinishRefund(ctx, billing.RefundResult{Channel: Channel, ID: row.ID, OrderID: refund.OrderID, ProviderID: event.RefundWXID, AmountFen: event.RefundFee, Status: "SUCCESS", CompletedAt: time.Unix(event.RefundTime, 0).UTC()})
	if e != nil {
		return e
	}
	return s.audit(ctx, event, "done")
}
func eventID(event Event) string {
	if event.Name == "refund_submission" {
		return core.RefundSubmissionEventID(event.RefundOrderID, event.RefundID)
	}
	identity := event.Name + ":" + event.OrderID + ":" + event.RefundOrderID + ":" + event.RefundID
	if event.OrderID == "" && event.RefundOrderID == "" && event.RefundID == "" {
		identity += ":" + event.Fingerprint
	}
	return core.Digest(identity)[:32]
}

type IOSDecision struct {
	Result   int    `json:"result_code" xml:"result_code"`
	Evidence string `json:"evidence" xml:"evidence"`
}

func (s *Service) RefundEvidence(ctx context.Context, id string) IOSDecision {
	_, o, e := s.order(ctx, id)
	if e != nil {
		return IOSDecision{1, "无法关联本系统订单，需人工核实"}
	}
	if o.Status == "created" || o.Status == "closed" {
		return IOSDecision{0, "本系统订单尚未发放积分"}
	}
	if o.Status == "refunded" {
		return IOSDecision{0, "本系统已记录退款并回收积分"}
	}
	return IOSDecision{1, "本系统已发放订单对应积分，请结合交易记录审核"}
}
