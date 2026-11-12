package partners

import (
	"context"
	"doubo/server/internal/core"
	"errors"
)

const reviewMessage = "已登记，等待超级管理员开通"

// access is what a mini-program user may do. Scanning only registers; the
// super-administrator approval opens generation access.
func access(r Reader, user string) (core.Access, error) {
	if out, ok, e := ownerAccess(r, user); ok || e != nil {
		return out, e
	}
	_, m, e := get[core.Membership](r, "memberships", user)
	if errors.Is(e, core.ErrNotFound) {
		return unregistered(r, user)
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
	switch m.Status {
	case "active":
	case "pending":
		out.Status, out.Message = "review", reviewMessage
		return out, nil
	case "rejected":
		return unregistered(r, user)
	case "unbound":
		out.Message = "授权已解绑，请重新扫描服务商的二维码登记"
		return out, nil
	default:
		out.Message = "授权已停用，请联系服务商或管理员"
		return out, nil
	}
	if e = activeChain(r, m.PartnerID); errors.Is(e, core.ErrPartnerDisabled) {
		out.Status, out.Message = "provider_disabled", e.Error()
		return out, nil
	} else if e != nil {
		return out, e
	}
	out.Active = true
	return out, nil
}

// ownerAccess reports a user who runs a provider (by scan or bind code).
func ownerAccess(r Reader, user string) (core.Access, bool, error) {
	_, o, e := get[core.PartnerOwner](r, "partner_owners", user)
	if errors.Is(e, core.ErrNotFound) || (e == nil && o.PartnerID == "") {
		return core.Access{}, false, nil
	}
	if e != nil {
		return core.Access{}, true, e
	}
	_, p, e := node(r, o.PartnerID)
	if e != nil {
		return core.Access{}, true, e
	}
	out := core.Access{Status: "provider", PartnerID: o.PartnerID, PartnerName: p.Name}
	if o.Status == "pending" {
		// A scanned provider waits under its parent; name that, not itself.
		if p.OwnerUser == user && p.ParentID != "" {
			if _, parent, e := node(r, p.ParentID); e == nil {
				out.PartnerName = parent.Name
			}
		}
		out.Status, out.Message = "review", reviewMessage
		return out, true, nil
	}
	if e = activeChain(r, o.PartnerID); errors.Is(e, core.ErrPartnerDisabled) {
		out.Status, out.Message = "provider_disabled", e.Error()
		return out, true, nil
	}
	out.Active = e == nil
	return out, true, e
}

func (s *Service) Access(ctx context.Context, user string) (core.Access, error) {
	return access(reader{ctx, s.Store}, user)
}

// OwnedPartner returns the provider a mini-program user runs, if any.
func (s *Service) OwnedPartner(ctx context.Context, user string) (string, error) {
	_, o, e := get[core.PartnerOwner](reader{ctx, s.Store}, "partner_owners", user)
	if e == nil && o.PartnerID == "" {
		e = core.ErrNotFound // unbound
	}
	return o.PartnerID, e
}

// unregistered is a user with no standing registration: never scanned, or
// rejected by the platform, in which case they see why and may scan again.
func unregistered(r Reader, user string) (core.Access, error) {
	_, reg, e := get[core.Registration](r, "registrations", user)
	if errors.Is(e, core.ErrNotFound) || (e == nil && reg.Status != "rejected") {
		return core.Access{Status: "pending", Message: core.ErrActivationRequired.Error()}, nil
	}
	if e != nil {
		return core.Access{}, e
	}
	message := "未通过开通审核"
	if reg.Reason != "" {
		message += "：" + reg.Reason
	}
	return core.Access{Status: "rejected", Message: message + "。可扫描其他二维码重新登记"}, nil
}

// SameOrderPartner reports whether an order still belongs to the payer's
// current provider: members carry a commission snapshot for theirs, while a
// provider's owner buys without one.
func SameOrderPartner(a core.Access, o core.Order) bool {
	current, ordered := a.PartnerID, ""
	if a.Status == "provider" {
		current = ""
	}
	if o.Distribution != nil {
		ordered = o.Distribution.PartnerID
	}
	return current == ordered
}
