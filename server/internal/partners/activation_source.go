package partners

import (
	"context"
	"doubo/server/internal/core"
	"errors"
)

// SourceNode is one provider on the chain from the platform to the user.
type SourceNode struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

// SourceUser names a member on the referral trail.
type SourceUser struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Nickname string `json:"nickname"`
}

// ActivationSource explains how a mini-program user registered and where
// they sit: owner of a provider, a 会员 of one (with the referrer whose
// promo code they used), or not registered.
type ActivationSource struct {
	Kind         string             `json:"kind"` // owner, member or none
	OwnerOf      string             `json:"ownerOf,omitempty"`
	Membership   *core.Membership   `json:"membership,omitempty"`
	Registration *core.Registration `json:"registration,omitempty"`
	Referrer     *SourceUser        `json:"referrer,omitempty"`
	Chain        []SourceNode       `json:"chain"`
}

func (s *Service) Source(ctx context.Context, user string) (ActivationSource, error) {
	r := reader{ctx, s.Store}
	out := ActivationSource{Kind: "none", Chain: []SourceNode{}}
	if _, reg, e := get[core.Registration](r, "registrations", user); e == nil {
		out.Registration = &reg
	} else if !errors.Is(e, core.ErrNotFound) {
		return out, e
	}
	partner := ""
	if _, o, e := get[core.PartnerOwner](r, "partner_owners", user); e == nil && o.PartnerID != "" {
		out.Kind, out.OwnerOf, partner = "owner", o.PartnerID, o.PartnerID
	} else if e != nil && !errors.Is(e, core.ErrNotFound) {
		return out, e
	} else {
		_, m, e := get[core.Membership](r, "memberships", user)
		if errors.Is(e, core.ErrNotFound) {
			return out, nil
		}
		if e != nil {
			return out, e
		}
		out.Kind, out.Membership, partner = "member", &m, m.PartnerID
		if m.Referrer != "" {
			_, ref, _ := get[SourceUser](r, "users", m.Referrer)
			ref.ID = m.Referrer
			out.Referrer = &ref
		}
	}
	_, p, e := node(r, partner)
	if errors.Is(e, core.ErrNotFound) {
		return out, nil
	}
	if e != nil {
		return out, e
	}
	for _, id := range append(append([]string{}, p.Path...), partner) {
		if id == core.RootPartner {
			continue
		}
		_, n, e := node(r, id)
		if e != nil {
			return out, e
		}
		out.Chain = append(out.Chain, SourceNode{ID: id, Name: n.Name, Role: n.Role, Status: n.Status})
	}
	return out, nil
}
