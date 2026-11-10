package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

func HoldCommissionRefund(tx store.Transaction, orderID, refundID string, o core.Order) error {
	if o.Distribution == nil {
		return nil
	}
	if e := Lock(tx); e != nil {
		return e
	}
	row, v, e := get[core.CommissionSettlement](tx, "commission_settlements", orderID)
	if errors.Is(e, core.ErrNotFound) {
		return nil // provider data was reset: no commission left to reverse
	}
	if e != nil {
		return e
	}
	if v.Status == "refunding" && v.RefundID == refundID {
		return nil
	}
	if v.Status != "credited" {
		return core.ErrConflict
	}
	v.Status = "refunding"
	v.RefundID = refundID
	v.Held = map[string]int64{}
	for _, share := range o.Distribution.Shares {
		_, a, e := commissionAccount(tx, share.PartnerID)
		if e != nil {
			return e
		}
		hold := min(max(a.BalanceFen, 0), share.AmountFen)
		v.Held[share.PartnerID] = hold
		item := core.CommissionEntry{PartnerID: share.PartnerID, OrderID: orderID, RefundID: refundID, Kind: "refund_hold", AmountFen: -hold, HeldDelta: hold, Note: "退款处理期间冻结可用佣金"}
		if e = entry(tx, ledgerID(refundID, share.PartnerID, "hold"), item, 0); e != nil {
			return e
		}
	}
	_, e = put(tx, "commission_settlements", row, v)
	return e
}
func FinishCommissionRefund(tx store.Transaction, orderID, refundID string, o core.Order, success bool) error {
	if o.Distribution == nil {
		return nil
	}
	if e := Lock(tx); e != nil {
		return e
	}
	row, v, e := get[core.CommissionSettlement](tx, "commission_settlements", orderID)
	if errors.Is(e, core.ErrNotFound) {
		return nil // provider data was reset: no commission left to reverse
	}
	if e != nil {
		return e
	}
	if v.Status != "refunding" || v.RefundID != refundID {
		return core.ErrConflict
	}
	for _, share := range o.Distribution.Shares {
		held := v.Held[share.PartnerID]
		item := core.CommissionEntry{PartnerID: share.PartnerID, OrderID: orderID, RefundID: refundID, Kind: "refund_cancel", AmountFen: held, HeldDelta: -held, Note: "退款关闭，解冻佣金"}
		if success {
			item.Kind = "refund_reverse"
			item.AmountFen = held - share.AmountFen
			item.Note = "退款成功冲回佣金；负余额由后续佣金抵扣"
		}
		if e = entry(tx, ledgerID(refundID, share.PartnerID, "settle"), item, 0); e != nil {
			return e
		}
	}
	v.Status = "credited"
	if success {
		v.Status = "reversed"
	}
	v.RefundID = ""
	v.Held = map[string]int64{}
	_, e = put(tx, "commission_settlements", row, v)
	return e
}
