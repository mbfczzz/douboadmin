package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
)

func validQuota(users, dealers int64, reason string) error {
	if users <= 0 || users > 1000000 || dealers < 0 || dealers > 1000000 {
		return rulef("请填写有效的用户额度")
	}
	if len([]rune(strings.TrimSpace(reason))) < 2 || len([]rune(reason)) > 200 {
		return rulef("请填写 2–200 字的操作原因")
	}
	return nil
}
func moveQuota(tx store.Transaction, id string, v core.QuotaMove) (core.Record, error) {
	if e := validQuota(v.Users, v.Partners, v.Reason); e != nil {
		return core.Record{}, e
	}
	_, child, e := node(tx, v.ChildID)
	if e != nil {
		return core.Record{}, e
	}
	if child.ParentID != v.ParentID || v.ChildID == core.RootPartner {
		return core.Record{}, rulef("只能在直接上下级之间划拨名额")
	}
	pr, p, e := quota(tx, v.ParentID)
	if e != nil {
		return pr, e
	}
	cr, c, e := quota(tx, v.ChildID)
	if e != nil {
		return cr, e
	}
	transfer := func(parent, child *core.QuotaPool, n int64) error {
		if v.Kind == "grant" {
			if e := ensure(parent, legacyRootQuota(tx, v.ParentID), n); e != nil {
				return e
			}
			parent.Allocated += n
			child.Granted += n
		} else if v.Kind == "reclaim" {
			if child.Available() < n || parent.Allocated < n {
				return rulef("只能收回下级尚未使用、预留或继续划拨的名额")
			}
			child.Granted -= n
			parent.Allocated -= n
		} else {
			return rulef("名额操作类型无效")
		}
		return nil
	}
	if e = transfer(&p.Users, &c.Users, v.Users); e != nil {
		return pr, e
	}
	if _, e = put(tx, "partner_quotas", pr, p); e != nil {
		return pr, e
	}
	if _, e = put(tx, "partner_quotas", cr, c); e != nil {
		return cr, e
	}
	return tx.Put("quota_moves", core.Record{ID: id, Owner: v.ChildID, Data: core.Data(v)}, 0)
}
func (s *Service) Transfer(ctx context.Context, v core.QuotaMove, key, actor string) (core.Record, error) {
	v.Actor = actor
	return s.command(ctx, actor, key, v, func(tx store.Transaction, id string) (core.Record, error) { return moveQuota(tx, id, v) })
}
func (s *Service) RequestQuota(ctx context.Context, id string, users, dealers int64, reason, key, actor string) (core.Record, error) {
	if e := validQuota(users, dealers, reason); e != nil {
		return core.Record{}, e
	}
	return s.command(ctx, actor, key, []any{"quota_request", id, users, dealers, reason}, func(tx store.Transaction, command string) (core.Record, error) {
		_, p, e := node(tx, id)
		if e != nil {
			return core.Record{}, e
		}
		if id == core.RootPartner {
			return core.Record{}, rulef("总账号是名额源头，无需申请")
		}
		v := core.QuotaRequest{PartnerID: id, ParentID: p.ParentID, Users: users, Status: "pending", Reason: reason}
		return tx.Put("quota_requests", core.Record{ID: command, Owner: id, Data: core.Data(v)}, 0)
	})
}
func (s *Service) DecideRequest(ctx context.Context, id string, approve bool, reason string, version int64, actor string) (out core.Record, err error) {
	if len([]rune(strings.TrimSpace(reason))) < 2 || len([]rune(reason)) > 200 {
		return out, rulef("请填写审批说明")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		row, v, e := get[core.QuotaRequest](tx, "quota_requests", id)
		if e != nil {
			return e
		}
		if row.Version != version || v.Status != "pending" {
			return core.ErrConflict
		}
		v.Status = "rejected"
		v.Decision = reason
		if approve {
			move := core.QuotaMove{ParentID: v.ParentID, ChildID: v.PartnerID, Users: v.Users, Kind: "grant", Reason: reason, Actor: actor}
			if _, e = moveQuota(tx, "request-"+id, move); e != nil {
				return e
			}
			v.Status = "approved"
		}
		out, e = put(tx, "quota_requests", row, v)
		return e
	})
	return
}
