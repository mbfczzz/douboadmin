package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

// setOwner points a user at a provider ("" unbinds), reusing their record.
func setOwner(tx store.Transaction, user, partner, status string) error {
	row, _, e := get[core.PartnerOwner](tx, "partner_owners", user)
	if errors.Is(e, core.ErrNotFound) {
		row, e = core.Record{ID: user, Owner: user}, nil
	}
	if e != nil {
		return e
	}
	_, e = put(tx, "partner_owners", row, core.PartnerOwner{PartnerID: partner, Status: status})
	return e
}

// Unbind releases the provider's bound account (approved or still pending)
// and issues a fresh bind code. Like every owner change it locks the user's
// wallet before the tree, then re-checks the binding.
func (s *Service) Unbind(ctx context.Context, partner, actor string) (out core.PartnerShare, err error) {
	_, current, e := get[core.PartnerShare](reader{ctx, s.Store}, pointers[BindCode], partner)
	if errors.Is(e, core.ErrNotFound) || (e == nil && current.User == "") {
		return out, rulef("该服务商还没有绑定小程序账号")
	}
	if e != nil {
		return out, e
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, current.User); e != nil {
			return e
		}
		if e := Lock(tx); e != nil {
			return e
		}
		if e := canHold(tx, partner, BindCode); e != nil {
			return e
		}
		row, v, e := get[core.PartnerShare](tx, pointers[BindCode], partner)
		if e != nil {
			return e
		}
		if v.User != current.User {
			return core.ErrConflict // changed meanwhile; the caller retries
		}
		if e = setOwner(tx, v.User, "", ""); e != nil {
			return e
		}
		if e = closePendingBind(tx, v.User, partner, actor); e != nil {
			return e
		}
		user := v.User
		v.User = ""
		if e = retireCode(tx, v.Code); e != nil {
			return e
		}
		if out, e = issueShare(tx, partner, core.ShareCode{PartnerID: partner, Kind: BindCode, Actor: actor}, row, v); e != nil {
			return e
		}
		return audit(tx, partner, "unbind_owner", actor, "解除服务商绑定", map[string]string{"user": user})
	})
	return
}

// closePendingBind rejects a bind registration still waiting when the admin
// unbinds, so it leaves the review list; the user may scan again.
func closePendingBind(tx store.Transaction, user, partner, actor string) error {
	row, reg, e := get[core.Registration](tx, "registrations", user)
	if errors.Is(e, core.ErrNotFound) || (e == nil && (reg.Status != "pending" || reg.CodeKind != BindCode || reg.PartnerID != partner)) {
		return nil
	}
	if e != nil {
		return e
	}
	now := nowUTC()
	reg.Status, reg.Reason, reg.DecidedBy, reg.DecidedAt = "rejected", "后台已解除绑定", actor, &now
	_, e = put(tx, "registrations", row, reg)
	if e == nil {
		e = saveCodeUse(tx, user, reg)
	}
	return e
}
