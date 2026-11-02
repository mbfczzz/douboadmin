package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
)

func (s *Service) RequestPayout(ctx context.Context, partner string, fen int64, note, key, actor string) (core.Record, error) {
	if fen <= 0 || fen > 100000000 || len([]rune(strings.TrimSpace(note))) < 2 || len([]rune(note)) > 200 {
		return core.Record{}, rulef("提现金额或说明无效")
	}
	return s.command(ctx, actor, key, []any{"payout", partner, fen, note}, func(tx store.Transaction, id string) (core.Record, error) {
		if _, _, e := node(tx, partner); e != nil {
			return core.Record{}, e
		}
		_, a, e := commissionAccount(tx, partner)
		if e != nil {
			return core.Record{}, e
		}
		if a.BalanceFen < fen {
			return core.Record{}, rulef("可提现佣金不足")
		}
		item := core.CommissionEntry{PartnerID: partner, Kind: "payout_hold", AmountFen: -fen, HeldDelta: fen, Actor: actor, Note: note}
		if e = entry(tx, ledgerID(id, partner, "payout-hold"), item, 0); e != nil {
			return core.Record{}, e
		}
		v := core.CommissionPayout{PartnerID: partner, AmountFen: fen, Status: "pending", Note: note, Actor: actor}
		return tx.Put("commission_payouts", core.Record{ID: id, Owner: partner, Data: core.Data(v)}, 0)
	})
}
func (s *Service) FinishPayout(ctx context.Context, id, status, reference, actor string, version int64) (out core.Record, err error) {
	reference = strings.TrimSpace(reference)
	if (status != "paid" && status != "cancelled") || len([]rune(reference)) < 4 || len([]rune(reference)) > 200 {
		return out, rulef("请填写线下打款凭据或取消原因")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		row, v, e := get[core.CommissionPayout](tx, "commission_payouts", id)
		if e != nil {
			return e
		}
		if row.Version != version || v.Status != "pending" {
			return core.ErrConflict
		}
		item := core.CommissionEntry{PartnerID: v.PartnerID, Kind: "payout_paid", HeldDelta: -v.AmountFen, Actor: actor, Note: reference}
		paid := v.AmountFen
		if status == "cancelled" {
			item.Kind = "payout_cancel"
			item.AmountFen = v.AmountFen
			paid = 0
		}
		if e = entry(tx, ledgerID(id, v.PartnerID, "payout-finish"), item, paid); e != nil {
			return e
		}
		v.Status = status
		v.Reference = reference
		out, e = put(tx, "commission_payouts", row, v)
		return e
	})
	return
}
