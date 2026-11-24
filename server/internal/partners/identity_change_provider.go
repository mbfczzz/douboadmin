package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
)

func changeToProvider(tx store.Transaction, user, kind, parent, actor string, current IdentityAssignment, state *core.VisitorIdentity) error {
	if current.MemberPartner != "" {
		row, member, e := get[core.Membership](tx, "memberships", user)
		if e != nil {
			return e
		}
		member.Status, member.ChangedAt = "visitor", nowUTC()
		if _, e = put(tx, "memberships", row, member); e != nil {
			return e
		}
	}
	if current.ProviderPartner != "" {
		if current.ProviderKind != kind {
			return rulef("已有服务商关系只能恢复原服务商层级")
		}
		if parent != "" && parent != current.ProviderParent {
			return rulef("已有服务商关系只能恢复原上级")
		}
		row, owner, e := get[core.PartnerOwner](tx, "partner_owners", user)
		if e != nil {
			return e
		}
		owner.Status = "active"
		if _, e = put(tx, "partner_owners", row, owner); e != nil {
			return e
		}
		if e = restorePartnerAccounts(tx, state.PausedAccounts); e != nil {
			return e
		}
		state.Enabled, state.PausedAccounts = false, []string{}
		return nil
	}
	if parent == "" {
		return rulef("请选择上级服务商")
	}
	profile, e := enabledProfile(tx, user)
	if e != nil {
		return e
	}
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = strings.TrimSpace(profile.Nickname)
	}
	partner := core.Partner{Name: name, Role: kind, Status: "active", OwnerUser: user}
	created, e := createChild(tx, core.NewID(), parent, partner, actor)
	if e != nil {
		return e
	}
	if e = setOwner(tx, user, created.ID, "active"); e != nil {
		return e
	}
	state.Enabled = false
	return nil
}

func validMemberParent(r Reader, parent string) error {
	if parent == core.RootPartner {
		return nil
	}
	_, provider, e := node(r, parent)
	if e != nil {
		return e
	}
	if !activatorRole(provider.Role) || provider.Status != "active" {
		return rulef("请选择正常的分公司、一级服务商或二级服务商")
	}
	return activeChain(r, parent)
}
