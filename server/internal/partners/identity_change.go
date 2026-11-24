package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

type IdentityAssignment struct {
	Version         int64  `json:"version"`
	Kind            string `json:"kind"`
	PartnerID       string `json:"partnerId,omitempty"`
	ParentID        string `json:"parentId,omitempty"`
	HasChildren     bool   `json:"hasChildren,omitempty"`
	PreviousKind    string `json:"previousKind,omitempty"`
	PreviousPartner string `json:"previousPartnerId,omitempty"`
	PreviousParent  string `json:"previousParentId,omitempty"`
	MemberPartner   string `json:"memberPartnerId,omitempty"`
	ProviderKind    string `json:"providerKind,omitempty"`
	ProviderPartner string `json:"providerPartnerId,omitempty"`
	ProviderParent  string `json:"providerParentId,omitempty"`
}

func visitorRecord(r Reader, user string) (core.Record, core.VisitorIdentity, error) {
	row, state, err := get[core.VisitorIdentity](r, "visitor_identities", user)
	if errors.Is(err, core.ErrNotFound) {
		return core.Record{ID: user, Owner: user}, core.VisitorIdentity{PausedAccounts: []string{}}, nil
	}
	return row, state, err
}

func identityAssignment(r Reader, user string) (IdentityAssignment, error) {
	stateRow, state, err := visitorRecord(r, user)
	if err != nil {
		return IdentityAssignment{}, err
	}
	out := IdentityAssignment{Version: stateRow.Version, PreviousKind: state.PreviousRole, PreviousPartner: state.PartnerID, PreviousParent: state.ParentID}
	if row, member, e := get[core.Membership](r, "memberships", user); e == nil {
		_ = row
		out.MemberPartner = member.PartnerID
		if member.Status == "active" && !state.Enabled {
			out.Kind, out.PartnerID = core.RoleMember, member.PartnerID
		}
	} else if !errors.Is(e, core.ErrNotFound) {
		return out, e
	}
	if _, owner, e := get[core.PartnerOwner](r, "partner_owners", user); e == nil && owner.PartnerID != "" {
		_, partner, e := node(r, owner.PartnerID)
		if e != nil {
			return out, e
		}
		out.ProviderKind, out.ProviderPartner, out.ProviderParent = partner.Role, owner.PartnerID, partner.ParentID
		if owner.Status == "active" && !state.Enabled {
			out.Kind, out.PartnerID, out.ParentID = partner.Role, owner.PartnerID, partner.ParentID
		}
	} else if e != nil && !errors.Is(e, core.ErrNotFound) {
		return out, e
	}
	if out.Kind == "" {
		if _, _, e := get[core.DirectAccess](r, "direct_access", user); e == nil {
			out.Kind, out.PartnerID = core.RoleMember, core.RootPartner
		} else if !errors.Is(e, core.ErrNotFound) {
			return out, e
		}
	}
	if out.Kind == "" {
		if _, reg, e := get[core.Registration](r, "registrations", user); e == nil && reg.Status == "pending" && reg.Role == core.RoleVisitor {
			out.PartnerID = reg.PartnerID
		} else if e != nil && !errors.Is(e, core.ErrNotFound) {
			return out, e
		}
	}
	if state.Enabled || out.Kind == "" {
		out.Kind, out.PartnerID, out.ParentID = core.RoleVisitor, state.PartnerID, state.ParentID
	}
	return out, nil
}

func (s *Service) IdentityAssignment(ctx context.Context, user string) (out IdentityAssignment, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		var e error
		out, e = identityAssignment(tx, user)
		return e
	})
	if err == nil && out.ProviderPartner != "" {
		page, e := s.Store.RecordPage(ctx, core.RecordQuery{Namespace: "partners", Fields: map[string]string{"parentId": out.ProviderPartner}, Page: 1, Size: 1})
		if e != nil {
			return out, e
		}
		out.HasChildren = page.Total > 0
	}
	return
}

func (s *Service) ChangeIdentity(ctx context.Context, user, kind, parent, actor string, version int64) (out IdentityAssignment, err error) {
	if kind != core.RoleVisitor && kind != core.RoleMember && kind != core.RoleS1 && kind != core.RoleS2 {
		return out, rulef("请选择游客、一级服务商、二级服务商或合伙人")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, e := tx.Lock("identity_control", core.Record{ID: "accounts", Data: core.Data(map[string]any{})}); e != nil {
			return e
		}
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		if e := Lock(tx); e != nil {
			return e
		}
		if _, e := enabledProfile(tx, user); e != nil {
			return e
		}
		stateRow, state, e := visitorRecord(tx, user)
		if e != nil {
			return e
		}
		if stateRow.Version != version {
			return core.ErrConflict
		}
		current, e := identityAssignment(tx, user)
		if e != nil {
			return e
		}
		switch kind {
		case core.RoleVisitor:
			e = changeToVisitor(tx, user, actor, current, &state)
		case core.RoleMember:
			e = changeToMember(tx, user, parent, actor, current, &state)
		default:
			e = changeToProvider(tx, user, kind, parent, actor, current, &state)
		}
		if e != nil {
			return e
		}
		state.ChangedAt, state.ChangedBy = nowUTC(), actor
		if _, e = put(tx, "visitor_identities", stateRow, state); e != nil {
			return e
		}
		if kind != core.RoleVisitor {
			e = finalizeVisitorRegistration(tx, user, actor, kind)
		}
		if e != nil {
			return e
		}
		if e = audit(tx, user, "identity_change", actor, "调整用户业务身份", map[string]any{"from": current.Kind, "to": kind, "parentId": parent}); e != nil {
			return e
		}
		out, e = identityAssignment(tx, user)
		return e
	})
	if err == nil {
		out, err = s.IdentityAssignment(ctx, user)
	}
	return
}

func changeToVisitor(tx store.Transaction, user, actor string, current IdentityAssignment, state *core.VisitorIdentity) error {
	if current.Kind == core.RoleVisitor {
		return nil
	}
	state.Enabled, state.PreviousRole, state.PartnerID, state.ParentID = true, current.Kind, current.PartnerID, current.ParentID
	if current.Kind == core.RoleMember {
		row, member, e := get[core.Membership](tx, "memberships", user)
		if errors.Is(e, core.ErrNotFound) {
			return nil
		}
		if e != nil {
			return e
		}
		member.Status, member.ChangedAt = "visitor", nowUTC()
		_, e = put(tx, "memberships", row, member)
		return e
	}
	if current.Kind == core.RoleS1 || current.Kind == core.RoleS2 {
		row, owner, e := get[core.PartnerOwner](tx, "partner_owners", user)
		if e != nil {
			return e
		}
		owner.Status = "visitor"
		if _, e = put(tx, "partner_owners", row, owner); e != nil {
			return e
		}
		paused, e := pausePartnerAccounts(tx, current.PartnerID)
		state.PausedAccounts = mergeIDs(state.PausedAccounts, paused)
		return e
	}
	return rulef("当前身份不能转换为游客")
}

func changeToMember(tx store.Transaction, user, parent, actor string, current IdentityAssignment, state *core.VisitorIdentity) error {
	if current.Kind == core.RoleMember && (parent == "" || parent == current.PartnerID) {
		state.Enabled = false
		return nil
	}
	if parent == "" {
		if current.MemberPartner != "" {
			parent = current.MemberPartner
		} else {
			return rulef("请选择上级")
		}
	}
	if e := validMemberParent(tx, parent); e != nil {
		return e
	}
	if current.ProviderPartner != "" {
		row, owner, e := get[core.PartnerOwner](tx, "partner_owners", user)
		if e != nil {
			return e
		}
		owner.Status = "visitor"
		if _, e = put(tx, "partner_owners", row, owner); e != nil {
			return e
		}
		paused, e := pausePartnerAccounts(tx, current.ProviderPartner)
		state.PausedAccounts = mergeIDs(state.PausedAccounts, paused)
		if e != nil {
			return e
		}
	}
	row, member, e := get[core.Membership](tx, "memberships", user)
	if errors.Is(e, core.ErrNotFound) {
		row, e = core.Record{ID: user, Owner: user}, nil
	}
	if e != nil {
		return e
	}
	now := nowUTC()
	member.PartnerID, member.Status, member.Method, member.ChangedAt = parent, "active", "admin", now
	member.ActivatedAt, member.CodeID, member.Referrer, member.Reason = now, "", "", ""
	if _, e = put(tx, "memberships", row, member); e != nil {
		return e
	}
	state.Enabled = false
	return nil
}
