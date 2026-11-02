package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

func commissionAccount(r Reader, id string) (core.Record, core.CommissionAccount, error) {
	row, v, e := get[core.CommissionAccount](r, "commission_accounts", id)
	if errors.Is(e, core.ErrNotFound) {
		return core.Record{ID: id, Owner: id}, v, nil
	}
	return row, v, e
}
func entry(tx store.Transaction, id string, v core.CommissionEntry, paidOut int64) error {
	if _, e := tx.Get("commission_ledger", id); e == nil {
		return nil
	} else if !errors.Is(e, core.ErrNotFound) {
		return e
	}
	row, a, e := commissionAccount(tx, v.PartnerID)
	if e != nil {
		return e
	}
	a.BalanceFen += v.AmountFen
	a.HeldFen += v.HeldDelta
	a.PaidOutFen += paidOut
	if a.HeldFen < 0 || a.PaidOutFen < 0 || a.BalanceFen > core.MaxBalance || a.BalanceFen < -core.MaxBalance {
		return rulef("佣金账户超出允许范围")
	}
	v.BalanceAfter = a.BalanceFen
	if _, e = put(tx, "commission_accounts", row, a); e != nil {
		return e
	}
	_, e = tx.Put("commission_ledger", core.Record{ID: id, Owner: v.PartnerID, Data: core.Data(v)}, 0)
	return e
}
func ledgerID(order, partner, kind string) string {
	return core.Digest(order + ":" + partner + ":" + kind)[:32]
}

func CreditCommission(tx store.Transaction, orderID string, order core.Order) error {
	if order.Distribution == nil {
		return nil
	}
	if e := Lock(tx); e != nil {
		return e
	}
	if _, e := tx.Get("commission_settlements", orderID); e == nil {
		return nil
	} else if !errors.Is(e, core.ErrNotFound) {
		return e
	}
	for _, share := range order.Distribution.Shares {
		v := core.CommissionEntry{PartnerID: share.PartnerID, OrderID: orderID, Kind: "recharge", AmountFen: share.AmountFen, Note: "充值到账分佣"}
		if e := entry(tx, ledgerID(orderID, share.PartnerID, "credit"), v, 0); e != nil {
			return e
		}
	}
	_, e := tx.Put("commission_settlements", core.Record{ID: orderID, Owner: order.UserID, Data: core.Data(core.CommissionSettlement{Status: "credited", Held: map[string]int64{}})}, 0)
	return e
}
