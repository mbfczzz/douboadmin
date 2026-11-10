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
		_, v, e := get[core.PartnerShare](tx, pointers[PromoCode], user)
		if e == nil {
			code = v.Code
			return nil
		}
		if !errors.Is(e, core.ErrNotFound) {
			return e
		}
		v, e = issueShare(tx, user, core.ShareCode{PartnerID: m.PartnerID, Kind: PromoCode, User: user, Actor: "user:" + user}, core.Record{}, v)
		code = v.Code
		return e
	})
	return
}
