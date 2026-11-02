package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
)

type Price struct {
	Enabled           bool                   `json:"enabled"`
	Version           string                 `json:"version"`
	CostPer100Fen     int64                  `json:"costPer100Fen"`
	IncomingPer100Fen int64                  `json:"incomingPer100Fen"`
	RetailPer100Fen   int64                  `json:"retailPer100Fen"`
	Shares            []core.CommissionShare `json:"shares"`
}

func prices(r Reader, id string) (Price, error) {
	_, p, e := policy(r)
	if e != nil {
		return Price{}, e
	}
	if p.CostPer100Fen < 0 || p.CostPer100Fen > 10000 || p.RootMarginBps < 0 || p.RootMarginBps > 10000 {
		return Price{}, rulef("总账号价格规则异常")
	}
	chain := []core.Record{}
	seen := map[string]bool{}
	for id != core.RootPartner {
		if len(chain) >= 8 || id == "" || seen[id] {
			return Price{}, rulef("服务商层级异常")
		}
		seen[id] = true
		row, n, e := node(r, id)
		if e != nil {
			return Price{}, e
		}
		chain = append(chain, row)
		id = n.ParentID
	}
	price := Price{Enabled: p.Enabled, CostPer100Fen: p.CostPer100Fen, IncomingPer100Fen: p.CostPer100Fen, RetailPer100Fen: 10000, Shares: []core.CommissionShare{}}
	parentID, parentName, margin := core.RootPartner, "总账号", p.RootMarginBps
	for i := len(chain) - 1; i >= 0; i-- {
		incoming := price.IncomingPer100Fen + (price.RetailPer100Fen-price.IncomingPer100Fen)*margin/10000
		price.Shares = append(price.Shares, core.CommissionShare{PartnerID: parentID, Name: parentName, AmountFen: incoming - price.IncomingPer100Fen})
		_, n, e := node(r, chain[i].ID)
		if e != nil {
			return price, e
		}
		if n.RetailPer100Fen < incoming || n.RetailPer100Fen > 1000000 || n.ChildMarginBps < 0 || n.ChildMarginBps > 10000 {
			return price, rulef("服务商售价低于进价，请先调整价格链")
		}
		price.IncomingPer100Fen = incoming
		price.RetailPer100Fen = n.RetailPer100Fen
		parentID, parentName, margin = chain[i].ID, n.Name, n.ChildMarginBps
	}
	price.Shares = append(price.Shares, core.CommissionShare{PartnerID: parentID, Name: parentName, AmountFen: price.RetailPer100Fen - price.IncomingPer100Fen})
	price.Version = core.Digest(string(core.Data(price)))[:32]
	return price, nil
}

func (s *Service) Price(ctx context.Context, id string) (out Price, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		var e error
		out, e = prices(tx, id)
		return e
	})
	return
}
func (s *Service) Policy(ctx context.Context) (core.Record, core.DistributionPolicy, error) {
	return policy(reader{ctx, s.Store})
}
func (s *Service) SavePolicy(ctx context.Context, v core.DistributionPolicy, version int64, actor string) (out core.Record, err error) {
	if v.CostPer100Fen < 0 || v.CostPer100Fen > 10000 || v.RootMarginBps < 0 || v.RootMarginBps > 10000 {
		return out, rulef("成本或毛利分配比例无效")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		var e error
		out, e = tx.Put("settings", core.Record{ID: "distribution", Data: core.Data(v)}, version)
		if e != nil {
			return e
		}
		return audit(tx, core.RootPartner, "pricing", actor, "更新总账号分佣规则", v)
	})
	return
}
