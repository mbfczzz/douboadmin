package partners

import (
	"context"
	"errors"

	"doubo/server/internal/core"
)

var ErrReviewDenied = errors.New("只能审核直属下级或本服务商会员的登记")

// A provider opens its direct children and its own members. Binding a
// provider's owner is reviewed by that provider's parent, never itself.
func checkRegistrationReviewer(r Reader, reg core.Registration, reviewer string) error {
	if reviewer == "" { // Trusted internal operations; HTTP always supplies a node.
		return nil
	}
	parent := reg.PartnerID
	if reg.Role != "member" {
		_, p, e := node(r, reg.PartnerID)
		if e != nil {
			return e
		}
		parent = p.ParentID
	}
	if parent != reviewer {
		return ErrReviewDenied
	}
	return activeChain(r, reviewer)
}

func reviewRegistration(r Reader, user, reviewer string) (core.Record, core.Registration, error) {
	row, reg, e := get[core.Registration](r, "registrations", user)
	if reviewer != "" && errors.Is(e, core.ErrNotFound) {
		e = ErrReviewDenied
	}
	if e == nil {
		e = checkRegistrationReviewer(r, reg, reviewer)
	}
	return row, reg, e
}

// RegistrationForReview returns the latest version only to its reviewers.
func (s *Service) RegistrationForReview(ctx context.Context, user, reviewer string) (core.Record, error) {
	if reviewer == "" {
		return core.Record{}, ErrReviewDenied
	}
	row, _, e := reviewRegistration(reader{ctx, s.Store}, user, reviewer)
	return row, e
}

func (s *Service) DecideForProvider(ctx context.Context, user string, approve bool, reason string, version int64, actor, reviewer string) (core.Record, error) {
	if reviewer == "" {
		return core.Record{}, ErrReviewDenied
	}
	return s.decide(ctx, user, approve, reason, version, actor, reviewer)
}

func (s *Service) CanReviewRegistration(ctx context.Context, reg core.Registration, reviewer string) (bool, error) {
	if reviewer == "" {
		return false, nil
	}
	e := checkRegistrationReviewer(reader{ctx, s.Store}, reg, reviewer)
	if errors.Is(e, ErrReviewDenied) {
		return false, nil
	}
	return e == nil, e
}
