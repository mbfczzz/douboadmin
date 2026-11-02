package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
)

func (s *Service) UserQuote(ctx context.Context, user string, fen, rate int64) (snapshot *core.DistributionSnapshot, units int64, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		var e error
		snapshot, units, e = Snapshot(tx, user, fen, rate)
		return e
	})
	return
}

// Snapshot is called with the user wallet locked. It never reprices a settled order.
func Snapshot(tx store.Transaction, user string, fen, pointsPerYuan int64) (*core.DistributionSnapshot, int64, error) {
	if _, e := enabledProfile(tx, user); e != nil {
		return nil, 0, e
	}
	if e := Lock(tx); e != nil {
		return nil, 0, e
	}
	a, e := access(tx, user)
	if e != nil {
		return nil, 0, e
	}
	if !a.Active {
		return nil, 0, core.ErrActivationRequired
	}
	p, e := prices(tx, a.PartnerID)
	if e != nil {
		return nil, 0, e
	}
	if !p.Enabled {
		return nil, 0, rulef("请先在后台确认并启用算力价格规则")
	}
	if fen < 1 || fen > 10000000 || pointsPerYuan < 1 || pointsPerYuan > 100000 {
		return nil, 0, rulef("充值参数无效")
	}
	units := fen * pointsPerYuan * 10000 / p.RetailPer100Fen
	if units <= 0 || units > core.MaxBalance {
		return nil, 0, rulef("充值金额对应积分超出允许范围")
	}
	row, m, e := get[core.Membership](tx, "memberships", user)
	if e != nil {
		return nil, 0, e
	}
	version := core.Digest(p.Version + string(core.Data([]any{row.Version, m.PartnerID, m.CodeID})))[:32]
	out := &core.DistributionSnapshot{PartnerID: a.PartnerID, PricingVersion: version, RetailPer100Fen: p.RetailPer100Fen, CostFen: (fen*p.CostPer100Fen + p.RetailPer100Fen - 1) / p.RetailPer100Fen, Shares: []core.CommissionShare{}}
	allocated := out.CostFen
	for i, share := range p.Shares {
		amount := fen * share.AmountFen / p.RetailPer100Fen
		if i == len(p.Shares)-1 {
			amount = fen - allocated
		}
		if amount < 0 {
			return nil, 0, rulef("分佣金额异常")
		}
		allocated += amount
		share.AmountFen = amount
		out.Shares = append(out.Shares, share)
	}
	return out, units, nil
}
