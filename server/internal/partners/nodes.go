package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
)

func (s *Service) Create(ctx context.Context, parent, name, key, actor string) (core.Record, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 60 {
		return core.Record{}, rulef("服务商名称需为 1–60 字")
	}
	return s.command(ctx, actor, key, []string{"create", parent, name}, func(tx store.Transaction, id string) (core.Record, error) {
		if e := activeChain(tx, parent); e != nil {
			return core.Record{}, e
		}
		_, p, e := node(tx, parent)
		if e != nil {
			return core.Record{}, e
		}
		if len(p.Path) >= 8 {
			return core.Record{}, rulef("服务商层级最多 8 层")
		}
		row, q, e := quota(tx, parent)
		if e != nil {
			return row, e
		}
		if e = ensure(&q.Partners, parent == core.RootPartner, 1); e != nil {
			return row, e
		}
		q.Partners.Used++
		if _, e = put(tx, "partner_quotas", row, q); e != nil {
			return row, e
		}
		price, e := prices(tx, parent)
		if e != nil {
			return row, e
		}
		incoming := price.IncomingPer100Fen + (price.RetailPer100Fen-price.IncomingPer100Fen)*p.ChildMarginBps/10000
		n := core.Partner{Name: name, ParentID: parent, Path: append(append([]string{}, p.Path...), parent), Status: "active", RetailPer100Fen: max(int64(10000), incoming), ChildMarginBps: 5000}
		created, e := tx.Put("partners", core.Record{ID: id, Owner: parent, Data: core.Data(n)}, 0)
		if e != nil {
			return created, e
		}
		return created, audit(tx, id, "create_partner", actor, "创建服务商，初始两类可用名额均为零", n)
	})
}
func (s *Service) Update(ctx context.Context, id string, v core.Partner, version int64, actor string) (out core.Record, err error) {
	if id == core.RootPartner {
		return out, rulef("总账号使用单独的价格规则")
	}
	v.Name = strings.TrimSpace(v.Name)
	if v.Name == "" || len([]rune(v.Name)) > 60 || (v.Status != "active" && v.Status != "disabled") || v.RetailPer100Fen < 1 || v.RetailPer100Fen > 1000000 || v.ChildMarginBps < 0 || v.ChildMarginBps > 10000 {
		return out, rulef("服务商名称、售价、比例或状态无效")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		row, old, e := node(tx, id)
		if e != nil {
			return e
		}
		v.ParentID = old.ParentID
		v.Path = old.Path
		out, e = tx.Put("partners", core.Record{ID: id, Owner: row.Owner, Data: core.Data(v)}, version)
		if e != nil {
			return e
		}
		if _, e = prices(tx, id); e != nil {
			return e
		}
		return audit(tx, id, "update_partner", actor, "调整服务商资料、价格或状态", v)
	})
	return
}

type Overview struct {
	Record     core.Record            `json:"record"`
	Quota      core.PartnerQuota      `json:"quota"`
	Price      Price                  `json:"price"`
	PriceError string                 `json:"priceError,omitempty"`
	Commission core.CommissionAccount `json:"commission"`
}

func (s *Service) Overview(ctx context.Context, id string) (out Overview, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		row, n, e := node(tx, id)
		if e != nil {
			return e
		}
		row.Data = core.Data(n)
		out.Record = row
		_, out.Quota, e = quota(tx, id)
		if e != nil {
			return e
		}
		out.Price, e = prices(tx, id)
		if e != nil {
			out.PriceError = e.Error()
		}
		_, out.Commission, e = commissionAccount(tx, id)
		return e
	})
	return
}
