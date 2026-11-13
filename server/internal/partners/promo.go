package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

// PromoCode is an active member's own code: whoever registers with it joins
// the member's provider with the member recorded as referrer.
func (s *Service) PromoCode(ctx context.Context, user string) (code string, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		_, m, e := get[core.Membership](tx, "memberships", user)
		if errors.Is(e, core.ErrNotFound) || (e == nil && m.Status != "active") {
			return rulef("开通会员后才有推广码")
		}
		if e != nil {
			return e
		}
		if e = activeChain(tx, m.PartnerID); e != nil {
			return e
		}
		pointer, v, e := get[core.PartnerShare](tx, pointers[PromoCode], user)
		if e == nil {
			_, old, err := get[core.ShareCode](tx, "share_codes", v.Code)
			if err == nil && old.Status == "active" && old.PartnerID == m.PartnerID && old.User == user {
				code = v.Code
				return nil
			}
			if err != nil && !errors.Is(err, core.ErrNotFound) {
				return err
			}
			if err == nil && old.Status == "active" {
				if err = retireCode(tx, v.Code); err != nil {
					return err
				}
			}
		} else if !errors.Is(e, core.ErrNotFound) {
			return e
		}
		if errors.Is(e, core.ErrNotFound) {
			pointer = core.Record{}
		}
		v, e = issueShare(tx, user, core.ShareCode{PartnerID: m.PartnerID, Kind: PromoCode, User: user, Actor: "user:" + user}, pointer, v)
		code = v.Code
		return e
	})
	return
}
