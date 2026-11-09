package partners

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"time"
)

// SourceNode is one provider on the chain from the platform to the activator.
type SourceNode struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Level  int    `json:"level"`
}

// SourceCode describes the activation code a user redeemed.
type SourceCode struct {
	ID             string     `json:"id"`
	Code           string     `json:"code,omitempty"`
	Label          string     `json:"label"`
	Suffix         string     `json:"suffix"`
	Status         string     `json:"status"`
	CreatorAccount string     `json:"creatorAccount,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UsedAt         *time.Time `json:"usedAt,omitempty"`
	Method         string     `json:"method,omitempty"`
}

// ActivationSource explains how a mini-program user gained access.
type ActivationSource struct {
	Kind       string           `json:"kind"` // provider, direct or none
	DirectAt   *time.Time       `json:"directAt,omitempty"`
	Membership *core.Membership `json:"membership,omitempty"`
	Chain      []SourceNode     `json:"chain"`
	Code       *SourceCode      `json:"code,omitempty"`
}

// Source reads the membership, provider chain and redeemed code of a user.
// The full code is shown only for a redeemed code: it is single-use and can no
// longer activate anyone, while pending codes stay behind Reveal's checks.
func (s *Service) Source(ctx context.Context, user string) (ActivationSource, error) {
	r := reader{ctx, s.Store}
	out := ActivationSource{Kind: "none", Chain: []SourceNode{}}
	_, direct, err := get[core.DirectAccess](r, "direct_access", user)
	if err == nil {
		out.Kind, out.DirectAt = "direct", &direct.ActivatedAt
	} else if !errors.Is(err, core.ErrNotFound) {
		return out, err
	}
	_, m, err := get[core.Membership](r, "memberships", user)
	if errors.Is(err, core.ErrNotFound) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	out.Kind, out.Membership = "provider", &m
	if _, p, e := node(r, m.PartnerID); e == nil {
		for _, id := range append(append([]string{}, p.Path...), m.PartnerID) {
			if id == core.RootPartner {
				continue
			}
			_, n, e := node(r, id)
			if e != nil {
				return out, e
			}
			out.Chain = append(out.Chain, SourceNode{ID: id, Name: n.Name, Status: n.Status, Level: len(n.Path)})
		}
	} else if !errors.Is(e, core.ErrNotFound) {
		return out, e
	}
	row, c, err := get[core.ActivationCode](r, "activation_codes", m.CodeID)
	if errors.Is(err, core.ErrNotFound) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	code := &SourceCode{ID: row.ID, Label: c.Label, Suffix: c.Suffix, Status: c.Status, CreatorAccount: c.CreatorAccount, CreatedAt: row.CreatedAt, UsedAt: c.UsedAt, Method: c.ActivationMethod}
	if c.Status == "used" && c.UserID == user {
		if full, e := codeFor(r, c.IssueID); e == nil && core.Digest(full) == row.ID {
			code.Code = full
		}
	}
	out.Code = code
	return out, nil
}
