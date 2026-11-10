package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
)

// Decide is the trusted platform entry point for pending registrations.
// Approval opens the account; rejection lets the user scan again.
func (s *Service) Decide(ctx context.Context, user string, approve bool, reason string, version int64, actor string) (core.Record, error) {
	return s.decide(ctx, user, approve, reason, version, actor, "")
}

func (s *Service) decide(ctx context.Context, user string, approve bool, reason string, version int64, actor, reviewer string) (out core.Record, err error) {
	reason = strings.TrimSpace(reason)
	if !approve && (len([]rune(reason)) < 2 || len([]rune(reason)) > 200) {
		return out, rulef("请填写 2–200 字的拒绝原因")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		if e := Lock(tx); e != nil {
			return e
		}
		row, reg, e := reviewRegistration(tx, user, reviewer)
		if e != nil {
			return e
		}
		if row.Version != version {
			return core.ErrConflict
		}
		if reg.Status != "pending" {
			return rulef("该登记已处理")
		}
		if _, e := enabledProfile(tx, user); approve && e != nil {
			return rulef("该账号已停用或注销，只能拒绝")
		}
		switch {
		case reg.Role == "member":
			e = decideMember(tx, user, approve)
		case reg.CodeKind == BindCode:
			e = decideBind(tx, user, reg.PartnerID, approve)
		default:
			e = decideProvider(tx, user, reg.PartnerID, approve)
		}
		if e != nil {
			return e
		}
		now := nowUTC()
		reg.Status, reg.Reason, reg.DecidedBy, reg.DecidedAt = map[bool]string{true: "approved", false: "rejected"}[approve], reason, actor, &now
		if out, e = put(tx, "registrations", row, reg); e != nil {
			return e
		}
		if e = saveCodeUse(tx, user, reg); e != nil {
			return e
		}
		return audit(tx, user, "registration_"+reg.Status, actor, reason, reg)
	})
	return
}

func decideMember(tx store.Transaction, user string, approve bool) error {
	row, m, e := get[core.Membership](tx, "memberships", user)
	if e != nil {
		return e
	}
	m.Status, m.ChangedAt = "rejected", nowUTC()
	if approve {
		m.Status, m.ActivatedAt = "active", m.ChangedAt
	}
	_, e = put(tx, "memberships", row, m)
	return e
}

// A scanned provider opens with its owner; a rejected one stays disabled.
func decideProvider(tx store.Transaction, user, partner string, approve bool) error {
	row, p, e := node(tx, partner)
	if e != nil {
		return e
	}
	if p.Status != "pending" || p.OwnerUser != user {
		return rulef("该服务商已不在待开通状态")
	}
	p.Status = "rejected"
	status := ""
	if approve {
		p.Status, status = "active", "active"
	}
	if _, e = tx.Put("partners", core.Record{ID: partner, Owner: row.Owner, Data: core.Data(p)}, row.Version); e != nil {
		return e
	}
	if !approve {
		partner = ""
	}
	return setOwner(tx, user, partner, status)
}

// A rejected bind frees the provider and issues a fresh bind code.
func decideBind(tx store.Transaction, user, partner string, approve bool) error {
	pointer, v, e := get[core.PartnerShare](tx, pointers[BindCode], partner)
	if e != nil {
		return e
	}
	// Unbound in the admin meanwhile: there is nothing left to open.
	if v.User != user {
		return rulef("该绑定已解除，请让负责人重新扫码")
	}
	if approve {
		return setOwner(tx, user, partner, "active")
	}
	if e := setOwner(tx, user, "", ""); e != nil {
		return e
	}
	if e := retireCode(tx, v.Code); e != nil {
		return e
	}
	v.User = ""
	_, e = issueShare(tx, partner, core.ShareCode{PartnerID: partner, Kind: BindCode, Actor: "system"}, pointer, v)
	return e
}
