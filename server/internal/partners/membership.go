package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"strings"
	"time"
)

func access(r Reader, user string) (core.Access, error) {
	_, m, e := get[core.Membership](r, "memberships", user)
	if errors.Is(e, core.ErrNotFound) {
		return core.Access{Status: "pending", Message: core.ErrActivationRequired.Error()}, nil
	}
	if e != nil {
		return core.Access{}, e
	}
	out := core.Access{Status: m.Status, PartnerID: m.PartnerID}
	_, p, e := node(r, m.PartnerID)
	if e != nil {
		return out, e
	}
	out.PartnerName = p.Name
	if m.Status != "active" {
		out.Message = "授权已停用或解绑，请联系管理员"
		return out, nil
	}
	if e = activeChain(r, m.PartnerID); errors.Is(e, core.ErrPartnerDisabled) {
		out.Status = "provider_disabled"
		out.Message = e.Error()
		return out, nil
	} else if e != nil {
		return out, e
	}
	out.Active = true
	return out, nil
}
func (s *Service) Access(ctx context.Context, user string) (core.Access, error) {
	return access(reader{ctx, s.Store}, user)
}

func (s *Service) Redeem(ctx context.Context, user, input string, source ...string) (out core.Access, err error) {
	method := "unknown"
	if len(source) > 0 && source[0] != "" {
		method = source[0]
	}
	if method != "qr" && method != "code" && method != "unknown" {
		return out, rulef("激活方式无效")
	}
	code := normalizeCode(input)
	if len(code) != 20 || strings.Trim(code, "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567") != "" {
		return out, rulef("激活码格式不正确")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		if e := Lock(tx); e != nil {
			return e
		}
		profile, e := enabledProfile(tx, user)
		if e != nil {
			return e
		}
		row, v, e := get[core.ActivationCode](tx, "activation_codes", core.Digest(code))
		if e != nil {
			return rulef("激活码不存在或已失效")
		}
		mr, m, lookup := get[core.Membership](tx, "memberships", user)
		if lookup != nil && !errors.Is(lookup, core.ErrNotFound) {
			return lookup
		}
		if v.Status == "used" && v.UserID == user && m.CodeID == row.ID {
			returnAccess, e := access(tx, user)
			out = returnAccess
			return e
		}
		if v.Status != "pending" || !v.ExpiresAt.After(time.Now()) {
			return rulef("激活码已使用、撤销或过期")
		}
		if lookup == nil && m.Status != "unbound" {
			return rulef("该微信账号已经绑定授权，不能重复占用名额")
		}
		if e = activeChain(tx, v.PartnerID); e != nil {
			return e
		}
		qr, q, e := quota(tx, v.PartnerID)
		if e != nil {
			return e
		}
		if q.Users.Reserved <= 0 {
			return rulef("激活名额记录异常")
		}
		q.Users.Reserved--
		q.Users.Used++
		if _, e = put(tx, "partner_quotas", qr, q); e != nil {
			return e
		}
		now := time.Now().UTC()
		v.Status = "used"
		v.UserID = user
		v.UsedAt = &now
		v.ActivatedNickname = profile.Nickname
		v.ActivationMethod = method
		if _, e = put(tx, "activation_codes", row, v); e != nil {
			return e
		}
		m = core.Membership{PartnerID: v.PartnerID, Status: "active", CodeID: row.ID, ActivatedAt: now, ChangedAt: now}
		if lookup != nil {
			mr = core.Record{ID: user, Owner: user}
		}
		if _, e = put(tx, "memberships", mr, m); e != nil {
			return e
		}
		if e = audit(tx, user, "activate", "user:"+user, "激活码授权", m); e != nil {
			return e
		}
		out, e = access(tx, user)
		return e
	})
	return
}
func (s *Service) ChangeMembership(ctx context.Context, user, status, reason, actor string, version int64) (out core.Record, err error) {
	if (status != "active" && status != "disabled" && status != "unbound") || len([]rune(strings.TrimSpace(reason))) < 2 || len([]rune(reason)) > 200 {
		return out, rulef("授权状态或原因无效")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		if e := Lock(tx); e != nil {
			return e
		}
		row, m, e := get[core.Membership](tx, "memberships", user)
		if e != nil {
			return e
		}
		if row.Version != version {
			return core.ErrConflict
		}
		if m.Status == "unbound" {
			return rulef("已解绑用户需要使用新的激活码")
		}
		if status == "unbound" {
			qr, q, e := quota(tx, m.PartnerID)
			if e != nil {
				return e
			}
			if q.Users.Used <= 0 {
				return rulef("名额记录异常")
			}
			q.Users.Used--
			if _, e = put(tx, "partner_quotas", qr, q); e != nil {
				return e
			}
		}
		m.Status = status
		m.Reason = reason
		m.ChangedAt = time.Now().UTC()
		out, e = put(tx, "memberships", row, m)
		if e != nil {
			return e
		}
		return audit(tx, user, "membership_"+status, actor, reason, m)
	})
	return
}
