package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

type ActivationUser struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	Name     string `json:"name"`
}
type ActivationTrace struct {
	Record            core.Record      `json:"record"`
	PartnerName       string           `json:"partnerName"`
	User              *ActivationUser  `json:"user,omitempty"`
	CurrentMembership *core.Membership `json:"currentMembership,omitempty"`
}

// History stays on the original code even when a user unbinds or redeems another one.
func (s *Service) Trace(ctx context.Context, id string) (out ActivationTrace, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		row, code, e := get[core.ActivationCode](tx, "activation_codes", id)
		if e != nil {
			return e
		}
		out.Record = row
		_, provider, e := node(tx, code.PartnerID)
		if e != nil && !errors.Is(e, core.ErrNotFound) {
			return e
		}
		out.PartnerName = provider.Name
		if code.UserID == "" {
			return nil
		}
		_, user, e := get[ActivationUser](tx, "users", code.UserID)
		if e != nil && !errors.Is(e, core.ErrNotFound) {
			return e
		}
		user.ID = code.UserID
		out.User = &user
		_, binding, e := get[core.Membership](tx, "memberships", code.UserID)
		if e != nil && !errors.Is(e, core.ErrNotFound) {
			return e
		}
		if e == nil {
			out.CurrentMembership = &binding
		}
		return nil
	})
	return
}
