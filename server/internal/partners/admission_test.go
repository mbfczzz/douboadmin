package partners

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"testing"
)

// admits reports whether the store lets user create an activation-gated job.
func admits(t *testing.T, s *Service, user, id string) bool {
	t.Helper()
	j := core.NewJob(user, id, core.JobInput{Kind: "image"})
	j.ActivationRequired = true
	_, e := s.Store.CreateJob(t.Context(), j)
	if e != nil && !errors.Is(e, core.ErrActivationRequired) {
		t.Fatal(e)
	}
	return e == nil
}

func TestNewTasksRecheckActivationInsideWalletTransaction(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "user")
	if admits(t, s, "user", "not-registered") {
		t.Fatal("unregistered user admitted")
	}
	code, _ := s.ShareCode(ctx, s1, "admin")
	register(t, s, ctx, code, "user")
	if admits(t, s, "user", "in-review") {
		t.Fatal("pending member admitted")
	}
	decide(t, s, ctx, "user", true)
	if !admits(t, s, "user", "activated") {
		t.Fatal("approved member refused")
	}
	m, _ := s.Store.Get(ctx, "memberships", "user")
	if _, e := s.ChangeMembership(ctx, "user", "unbound", "解绑测试", "admin", m.Version); e != nil {
		t.Fatal(e)
	}
	if admits(t, s, "user", "after-unbind") {
		t.Fatal("revoked membership admitted")
	}
}

func TestScannedProviderOwnerWorksOnlyOnceApproved(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "boss")
	code, _ := s.Share(ctx, branch, S1Code, "admin")
	register(t, s, ctx, code.Code, "boss")
	if admits(t, s, "boss", "pending-owner") {
		t.Fatal("pending provider owner admitted")
	}
	decide(t, s, ctx, "boss", true)
	if !admits(t, s, "boss", "active-owner") {
		t.Fatal("approved provider owner refused")
	}
	// Disabling the parent stops the whole chain below it.
	view, _ := s.Overview(ctx, branch)
	var p core.Partner
	_ = json.Unmarshal(view.Record.Data, &p)
	p.Status = "disabled"
	if _, e := s.Update(ctx, branch, p, view.Record.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	if admits(t, s, "boss", "parent-disabled") {
		t.Fatal("owner below a disabled 分公司 admitted")
	}
	if access, _ := s.Access(ctx, "boss"); access.Active || access.Status != "provider_disabled" {
		t.Fatal(access)
	}
}

func TestOwnerRechargeHasNoDistribution(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "boss")
	policy := core.DefaultDistributionPolicy()
	policy.Enabled = true
	if _, e := s.SavePolicy(ctx, policy, 0, "admin"); e != nil {
		t.Fatal(e)
	}
	code, _ := s.Share(ctx, branch, S2Code, "admin")
	register(t, s, ctx, code.Code, "boss")
	if _, _, e := s.UserQuote(ctx, "boss", 10000, 100); !errors.Is(e, core.ErrActivationRequired) {
		t.Fatal("a pending owner was quoted", e)
	}
	decide(t, s, ctx, "boss", true)
	snapshot, units, e := s.UserQuote(ctx, "boss", 10000, 100)
	if e != nil || snapshot != nil || units != 1000000 {
		t.Fatal("owner recharge", snapshot, units, e)
	}
}
