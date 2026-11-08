package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
)

// MaxLevels is the deepest provider level below the platform.
const MaxLevels = 3

func (s *Service) Create(ctx context.Context, parent, name string, users int64, key, actor string) (core.Record, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 60 {
		return core.Record{}, rulef("服务商名称需为 1–60 字")
	}
	if users <= 0 || users > 1000000 {
		return core.Record{}, rulef("可授权账号额度需为 1–1000000")
	}
	return s.command(ctx, actor, key, []any{"create", parent, name, users}, func(tx store.Transaction, id string) (core.Record, error) {
		if e := activeChain(tx, parent); e != nil {
			return core.Record{}, e
		}
		_, p, e := node(tx, parent)
		if e != nil {
			return core.Record{}, e
		}
		// Root has an empty path; a parent already at level 3 cannot add a fourth level.
		if len(p.Path) >= MaxLevels {
			return core.Record{}, rulef("服务商最多 %d 级，不能再创建下级", MaxLevels)
		}
		price, e := prices(tx, parent)
		if e != nil {
			return core.Record{}, e
		}
		incoming := price.IncomingPer100Fen + (price.RetailPer100Fen-price.IncomingPer100Fen)*p.ChildMarginBps/10000
		retail, margin := max(int64(10000), incoming), int64(5000)
		if parent != core.RootPartner {
			// A new child starts within its parent's own price and margin.
			retail, margin = max(incoming, min(retail, p.RetailPer100Fen)), min(margin, p.ChildMarginBps)
		}
		n := core.Partner{Name: name, ParentID: parent, Path: append(append([]string{}, p.Path...), parent), Status: "active", RetailPer100Fen: retail, ChildMarginBps: margin}
		created, e := tx.Put("partners", core.Record{ID: id, Owner: parent, Data: core.Data(n)}, 0)
		if e != nil {
			return created, e
		}
		if parent == core.RootPartner {
			row, initial, quotaErr := quota(tx, id)
			if quotaErr != nil {
				return created, quotaErr
			}
			initial.Users.Granted = users
			if _, quotaErr = put(tx, "partner_quotas", row, initial); quotaErr != nil {
				return created, quotaErr
			}
		} else if _, e = moveQuota(tx, core.NewID(), core.QuotaMove{
			ParentID: parent,
			ChildID:  id,
			Users:    users,
			Kind:     "grant",
			Reason:   "创建下级服务商并分配初始额度",
			Actor:    actor,
		}); e != nil {
			return created, e
		}
		return created, audit(tx, id, "create_partner", actor, "创建服务商并分配初始用户额度", map[string]any{"partner": n, "users": users})
	})
}

type TreeItem struct {
	Record core.Record       `json:"record"`
	Quota  core.PartnerQuota `json:"quota"`
}

func (s *Service) Tree(ctx context.Context) ([]TreeItem, error) {
	rows, err := s.Store.List(ctx, "partners", "")
	if err != nil {
		return nil, err
	}
	quotaRows, err := s.Store.List(ctx, "partner_quotas", "")
	if err != nil {
		return nil, err
	}
	quotas := make(map[string]core.PartnerQuota, len(quotaRows))
	for _, row := range quotaRows {
		var value core.PartnerQuota
		if err = json.Unmarshal(row.Data, &value); err != nil {
			return nil, err
		}
		quotas[row.ID] = value
	}
	out := make([]TreeItem, len(rows))
	for i, row := range rows {
		out[i] = TreeItem{Record: row, Quota: quotas[row.ID]}
	}
	return out, nil
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
