package partners

import (
	"errors"
	"testing"

	"doubo/server/internal/core"
)

// pending registers user through the code of kind ("member", "s1", "s2") of
// the given provider and returns the registration version.
func pending(t *testing.T, s *Service, p string, kind, user string) int64 {
	t.Helper()
	ctx := t.Context()
	addUsers(t, s, ctx, user)
	var code string
	if kind == "member" {
		code, _ = s.ShareCode(ctx, p, "admin")
	} else {
		c, e := s.Share(ctx, p, kind, "admin")
		if e != nil {
			t.Fatal(e)
		}
		code = c.Code
	}
	register(t, s, ctx, code, user)
	row, e := s.Store.Get(ctx, "registrations", user)
	if e != nil {
		t.Fatal(e)
	}
	return row.Version
}

func setRight(t *testing.T, s *Service, id string, on bool) {
	t.Helper()
	row, e := s.Store.Get(t.Context(), "partners", id)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.SetActivationRight(t.Context(), id, on, row.Version, "admin"); e != nil {
		t.Fatal(e)
	}
}

func TestActivationRightOffLeavesDecisionsToTheSuperAdministrator(t *testing.T) {
	s, ctx, branch, s1, _ := tiers(t)
	v := pending(t, s, s1, "member", "m-off")
	for _, reviewer := range []string{s1, branch} {
		for _, approve := range []bool{true, false} {
			// The direct provider is told the switch is off; a higher one only
			// that the registration is not theirs to review.
			if _, e := s.DecideForProvider(ctx, "m-off", approve, "资料不符", v, "provider", reviewer); !errors.Is(e, ErrApprovalDenied) && !errors.Is(e, ErrReviewDenied) {
				t.Fatal("decided without the switch", reviewer, approve, e)
			}
		}
	}
	if ok, _ := s.CanActivateChildren(ctx, s1); ok {
		t.Fatal("switch defaults to on")
	}
}

func TestActivationRightScopePerRole(t *testing.T) {
	s, ctx, branch, s1, s2 := tiers(t)
	for _, id := range []string{branch, s1, s2} {
		setRight(t, s, id, true)
	}
	cases := []struct {
		owner, kind, user string
		allowed           map[string]bool
	}{
		// 分公司: 一级服务商、二级服务商、合伙人 below it.
		{branch, "s1", "u-s1", map[string]bool{branch: true}},
		{branch, "s2", "u-s2b", map[string]bool{branch: true}},
		// 一级服务商: 二级服务商、合伙人.
		{s1, "s2", "u-s2", map[string]bool{branch: true, s1: true}},
		{s1, "member", "u-m1", map[string]bool{branch: true, s1: true}},
		// 二级服务商: 合伙人.
		{s2, "member", "u-m2", map[string]bool{branch: true, s1: true, s2: true}},
	}
	for _, c := range cases {
		reg := pending(t, s, c.owner, c.kind, c.user)
		_, r, _ := get[core.Registration](reader{ctx, s.Store}, "registrations", c.user)
		for _, reviewer := range []string{branch, s1, s2} {
			ok, e := s.CanDecideRegistration(ctx, r, reviewer)
			if e != nil || ok != c.allowed[reviewer] {
				t.Fatal("scope", c.user, reviewer, ok, e)
			}
		}
		// The lowest allowed provider opens it; the account becomes active.
		var opener string
		for _, id := range []string{s2, s1, branch} {
			if c.allowed[id] {
				opener = id
				break
			}
		}
		if _, e := s.DecideForProvider(ctx, c.user, true, "", reg, "provider", opener); e != nil {
			t.Fatal("approve", c.user, e)
		}
		if access, _ := s.Access(ctx, c.user); !access.Active {
			t.Fatal("not opened", c.user, access)
		}
	}
}

func TestActivationRightRejectsAndStaysIndependent(t *testing.T) {
	s, ctx, branch, s1, _ := tiers(t)
	setRight(t, s, branch, true)
	if partnerOf(t, s, ctx, s1).ActivateChildren {
		t.Fatal("switch leaked to the child")
	}
	v := pending(t, s, s1, "member", "m-reject")
	if _, e := s.DecideForProvider(ctx, "m-reject", true, "", v, "provider", s1); !errors.Is(e, ErrApprovalDenied) {
		t.Fatal("child used the parent's switch", e)
	}
	if _, e := s.DecideForProvider(ctx, "m-reject", false, "资料不符", v, "provider", branch); e != nil {
		t.Fatal("reject with the switch on", e)
	}
	// A profile edit by the super administrator keeps the switch.
	row, _ := s.Store.Get(ctx, "partners", branch)
	p := partnerOf(t, s, ctx, branch)
	p.ActivateChildren = false
	if _, e := s.Update(ctx, branch, p, row.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	if !partnerOf(t, s, ctx, branch).ActivateChildren {
		t.Fatal("profile update cleared the switch")
	}
}

func TestActivationRightNeedsAnActiveChainAndEligibleRole(t *testing.T) {
	s, ctx, branch, s1, _ := tiers(t)
	setRight(t, s, s1, true)
	v := pending(t, s, s1, "member", "m-chain")
	row, _ := s.Store.Get(ctx, "partners", branch)
	p := partnerOf(t, s, ctx, branch)
	p.Status = "disabled"
	if _, e := s.Update(ctx, branch, p, row.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	if _, e := s.DecideForProvider(ctx, "m-chain", true, "", v, "provider", s1); e == nil {
		t.Fatal("approved under a disabled 分公司")
	}
	if ok, _ := s.CanActivateChildren(ctx, s1); ok {
		t.Fatal("disabled chain still reported the right")
	}
	if _, e := s.SetActivationRight(ctx, core.RootPartner, true, 0, "admin"); e == nil {
		t.Fatal("root accepted the switch")
	}
}

func TestActivationRightListingSurvivesADeletedProvider(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	setRight(t, s, branch, true)
	// A registration pointing at a provider that no longer exists.
	reg := core.Registration{Role: "member", PartnerID: "gone"}
	if ok, e := s.CanDecideRegistration(ctx, reg, branch); ok || e != nil {
		t.Fatal("missing provider broke the listing", ok, e)
	}
	if ok, e := s.CanReviewRegistration(ctx, reg, branch); ok || e != nil {
		t.Fatal("review check differs", ok, e)
	}
}
