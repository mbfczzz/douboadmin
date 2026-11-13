package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
)

// growth lists the provider roles each role may add below itself; the
// platform ("") adds 分公司. Every provider grows 会员 through its member code.
var growth = map[string][]string{"": {core.RoleBranch}, core.RoleBranch: {core.RoleS1, core.RoleS2}, core.RoleS1: {core.RoleS2}}

// RoleOf is a provider's role; the platform root has none.
func RoleOf(id string, p core.Partner) string {
	if id == core.RootPartner {
		return ""
	}
	return p.Role
}

func CanGrow(parentRole, role string) bool {
	for _, r := range growth[parentRole] {
		if r == role {
			return true
		}
	}
	return false
}

// Create adds a provider below parent in the admin (platform only).
func (s *Service) Create(ctx context.Context, parent, name, role, key, actor string) (core.Record, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 60 {
		return core.Record{}, rulef("服务商名称需为 1–60 字")
	}
	return s.command(ctx, actor, key, []any{"create", parent, name, role}, func(tx store.Transaction, id string) (core.Record, error) {
		return createChild(tx, id, parent, core.Partner{Name: name, Role: role, Status: "active"}, actor)
	})
}

// createChild adds a provider below parent, priced within the parent's own
// price and margin. A provider made by scanning starts pending.
func createChild(tx store.Transaction, id, parent string, n core.Partner, actor string) (core.Record, error) {
	if e := activeChain(tx, parent); e != nil {
		return core.Record{}, e
	}
	_, p, e := node(tx, parent)
	if e != nil {
		return core.Record{}, e
	}
	if !CanGrow(RoleOf(parent, p), n.Role) {
		return core.Record{}, rulef("该服务商不能添加这一级的下级")
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
	n.ParentID, n.Path = parent, append(append([]string{}, p.Path...), parent)
	n.RetailPer100Fen, n.ChildMarginBps = retail, margin
	created, e := tx.Put("partners", core.Record{ID: id, Owner: parent, Data: core.Data(n)}, 0)
	if e != nil {
		return created, e
	}
	return created, audit(tx, id, "create_partner", actor, "创建服务商", map[string]any{"partner": n})
}

func frozen(status string) bool { return status == "pending" || status == "rejected" }

// Tree lists every provider record except rejected registrations; callers
// filter it to their scope.
func (s *Service) Tree(ctx context.Context) ([]core.Record, error) {
	rows, e := store.AllRecords(ctx, s.Store, "partners", "")
	out := rows[:0]
	for _, row := range rows {
		var p core.Partner
		if json.Unmarshal(row.Data, &p) == nil && p.Status != "rejected" {
			out = append(out, row)
		}
	}
	return out, e
}
func (s *Service) Update(ctx context.Context, id string, v core.Partner, version int64, actor string) (out core.Record, err error) {
	if id == core.RootPartner {
		return out, rulef("总账号使用单独的价格规则")
	}
	v.Name = strings.TrimSpace(v.Name)
	if v.Name == "" || len([]rune(v.Name)) > 60 || (v.Status != "active" && v.Status != "disabled" && v.Status != "pending" && v.Status != "rejected") || v.RetailPer100Fen < 1 || v.RetailPer100Fen > 1000000 || v.ChildMarginBps < 0 || v.ChildMarginBps > 10000 {
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
		v.Role, v.ParentID, v.Path, v.OwnerUser, v.Phone = old.Role, old.ParentID, old.Path, old.OwnerUser, old.Phone
		// Only registration approval opens a scanned provider; a rejected
		// one stays closed.
		if frozen(old.Status) || frozen(v.Status) {
			v.Status = old.Status
		}
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
		out.Price, e = prices(tx, id)
		if e != nil {
			out.PriceError = e.Error()
		}
		_, out.Commission, e = commissionAccount(tx, id)
		return e
	})
	return
}
