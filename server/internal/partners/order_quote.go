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
	snapshot, err := PurchaseSnapshot(tx, user, fen)
	if err != nil {
		return nil, 0, err
	}
	if pointsPerYuan < 1 || pointsPerYuan > 100000 {
		return nil, 0, rulef("充值参数无效")
	}
	units := fen * pointsPerYuan
	if snapshot != nil {
		units = units * 10000 / snapshot.RetailPer100Fen
	}
	if units <= 0 || units > core.MaxBalance {
		return nil, 0, rulef("充值金额对应积分超出允许范围")
	}
	return snapshot, units, nil
}

// UserPurchaseQuote authenticates the customer and quotes commissions, never SKU credit.
func (s *Service) UserPurchaseQuote(ctx context.Context, user string, fen int64) (snapshot *core.DistributionSnapshot, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		var e error
		snapshot, e = PurchaseSnapshot(tx, user, fen)
		return e
	})
	return
}

// PurchaseSnapshot preserves authorization and commission pricing independently of points.
// The caller holds the user wallet lock.
func PurchaseSnapshot(tx store.Transaction, user string, fen int64) (*core.DistributionSnapshot, error) {
	if _, e := enabledProfile(tx, user); e != nil {
		return nil, e
	}
	if e := Lock(tx); e != nil {
		return nil, e
	}
	a, e := access(tx, user)
	if e != nil {
		return nil, e
	}
	if !a.Active {
		return nil, core.ErrActivationRequired
	}
	if fen < 1 || fen > core.MaxOrderAmountFen {
		return nil, rulef("充值参数无效")
	}
	// No commission on a provider owner's own purchases.
	if a.PartnerID == "" || a.Status == "provider" {
		return nil, nil
	}
	p, e := prices(tx, a.PartnerID)
	if e != nil {
		return nil, e
	}
	if !p.Enabled {
		return nil, rulef("请先在后台确认并启用算力价格规则")
	}
	row, m, e := get[core.Membership](tx, "memberships", user)
	if e != nil {
		return nil, e
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
			return nil, rulef("分佣金额异常")
		}
		allocated += amount
		share.AmountFen = amount
		out.Shares = append(out.Shares, share)
	}
	return out, nil
}
