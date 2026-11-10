package partners

import (
	"errors"
	"testing"

	"doubo/server/internal/core"
)

func TestPublicReviewHelpersRejectMissingReviewer(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "review-user")
	code, _ := s.ShareCode(ctx, s1, "admin")
	register(t, s, ctx, code, "review-user")
	row, reg, _ := get[core.Registration](reader{ctx, s.Store}, "registrations", "review-user")
	if _, e := s.RegistrationForReview(ctx, row.ID, ""); !errors.Is(e, ErrReviewDenied) {
		t.Fatal("missing reviewer exposed registration", e)
	}
	if allowed, e := s.CanReviewRegistration(ctx, reg, ""); allowed || e != nil {
		t.Fatal("missing reviewer appeared eligible", allowed, e)
	}
	if _, e := s.DecideForProvider(ctx, row.ID, true, "", row.Version, "admin", ""); !errors.Is(e, ErrReviewDenied) {
		t.Fatal("missing reviewer opened account", e)
	}
	access, _ := s.Access(ctx, row.ID)
	if access.Active || access.Status != "review" {
		t.Fatal("denied review changed access", access)
	}
}
