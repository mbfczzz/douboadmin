package partners

import (
	"context"
	"errors"

	"doubo/server/internal/core"
)

var ErrReviewDenied = errors.New("只能审核本服务商名下的登记")
var ErrApprovalDenied = errors.New("未开启下级小程序开通权限，仅超级管理员可开通或拒绝")

// A provider with the 下级小程序开通权限 switch on inspects and decides every
// registration below it; with it off, only the super administrator does.
func checkRegistrationReviewer(r Reader, reg core.Registration, reviewer string) error {
	if reviewer == "" { // Trusted internal operations; HTTP always supplies a node.
		return nil
	}
	// With the switch off a provider neither sees nor decides registrations.
	return checkActivation(r, reg, reviewer)
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

// CanDecideRegistration: may this provider approve or reject it now?
func (s *Service) CanDecideRegistration(ctx context.Context, reg core.Registration, reviewer string) (bool, error) {
	if reviewer == "" {
		return false, nil
	}
	e := checkActivation(reader{ctx, s.Store}, reg, reviewer)
	// A provider deleted since the registration simply is not reviewable.
	if errors.Is(e, ErrApprovalDenied) || errors.Is(e, ErrReviewDenied) || errors.Is(e, core.ErrPartnerDisabled) || errors.Is(e, core.ErrNotFound) {
		return false, nil
	}
	return e == nil, e
}

// CanReviewRegistration: seeing a registration needs the same right as
// deciding it.
func (s *Service) CanReviewRegistration(ctx context.Context, reg core.Registration, reviewer string) (bool, error) {
	return s.CanDecideRegistration(ctx, reg, reviewer)
}
