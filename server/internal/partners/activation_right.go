package partners

import (
	"context"
	"errors"
	"slices"

	"doubo/server/internal/core"
	"doubo/server/internal/store"
)

// Roles that can hold the 下级小程序开通权限 switch; 合伙人 (members) cannot.
func activatorRole(role string) bool {
	return role == core.RoleBranch || role == core.RoleS1 || role == core.RoleS2
}

// SetActivationRight turns one provider's switch on or off. Each provider is
// independent: nothing is inherited by or copied to its children.
func (s *Service) SetActivationRight(ctx context.Context, id string, enabled bool, version int64, actor string) (out core.Record, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		row, p, e := node(tx, id)
		if e != nil {
			return e
		}
		if id == core.RootPartner || !activatorRole(p.Role) || p.Status == "deleted" {
			return rulef("仅分公司、一级服务商、二级服务商可设置下级开通权限")
		}
		p.ActivateChildren = enabled
		if out, e = tx.Put("partners", core.Record{ID: id, Owner: row.Owner, Data: core.Data(p)}, version); e != nil {
			return e
		}
		reason := map[bool]string{true: "开启下级小程序开通权限", false: "关闭下级小程序开通权限"}[enabled]
		return audit(tx, id, "activation_right", actor, reason, map[string]bool{"enabled": enabled})
	})
	return out, err
}

// CanActivateChildren reports whether a provider login may open accounts
// below it now: switch on, an eligible role, and an active chain to the top.
func (s *Service) CanActivateChildren(ctx context.Context, reviewer string) (bool, error) {
	e := checkActivator(reader{ctx, s.Store}, reviewer)
	if errors.Is(e, ErrApprovalDenied) || errors.Is(e, core.ErrPartnerDisabled) || errors.Is(e, core.ErrNotFound) {
		return false, nil
	}
	return e == nil, e
}

func checkActivator(r Reader, reviewer string) error {
	if reviewer == "" || reviewer == core.RootPartner {
		return ErrApprovalDenied
	}
	_, me, e := node(r, reviewer)
	if e != nil {
		return e
	}
	if !me.ActivateChildren || !activatorRole(me.Role) {
		return ErrApprovalDenied
	}
	return activeChain(r, reviewer)
}

// below reports whether a registration sits under the reviewer: a member of
// the reviewer or of any provider below it, or a provider/binding whose node
// has the reviewer among its ancestors.
func below(r Reader, reg core.Registration, reviewer string) (bool, error) {
	if reg.Role == "member" && reg.PartnerID == reviewer {
		return true, nil
	}
	_, target, e := node(r, reg.PartnerID)
	if e != nil {
		return false, e
	}
	return slices.Contains(target.Path, reviewer), nil
}

// checkActivation allows a provider decision on one registration.
func checkActivation(r Reader, reg core.Registration, reviewer string) error {
	if e := checkActivator(r, reviewer); e != nil {
		return e
	}
	ok, e := below(r, reg, reviewer)
	if e != nil {
		return e
	}
	if !ok {
		return ErrReviewDenied
	}
	return nil
}
