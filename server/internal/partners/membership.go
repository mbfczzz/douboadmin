package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
	"time"
)

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
		if m.Status != "active" && m.Status != "disabled" {
			return rulef("只能停用、恢复或解绑已开通的会员")
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
