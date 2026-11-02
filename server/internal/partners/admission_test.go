package partners

import (
	"doubo/server/internal/core"
	"errors"
	"testing"
)

func TestNewTasksRecheckActivationInsideWalletTransaction(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	_, _ = s.Store.Put(ctx, "users", core.Record{ID: "user", Data: core.Data(map[string]string{"nickname": "test"})}, 0)
	j := core.NewJob("user", "not-activated", core.JobInput{Kind: "image"})
	j.ActivationRequired = true
	if _, e := s.Store.CreateJob(ctx, j); !errors.Is(e, core.ErrActivationRequired) {
		t.Fatal("inactive user admitted", e)
	}
	code, e := s.Issue(ctx, s1, "user", 7, "admission-code", "admin")
	if e != nil {
		t.Fatal(e)
	}
	token, _ := s.Reveal(ctx, code.ID)
	if _, e = s.Redeem(ctx, "user", token); e != nil {
		t.Fatal(e)
	}
	j = core.NewJob("user", "activated", core.JobInput{Kind: "image"})
	j.ActivationRequired = true
	if _, e = s.Store.CreateJob(ctx, j); e != nil {
		t.Fatal(e)
	}
	m, _ := s.Store.Get(ctx, "memberships", "user")
	if _, e = s.ChangeMembership(ctx, "user", "unbound", "解绑测试", "admin", m.Version); e != nil {
		t.Fatal(e)
	}
	j = core.NewJob("user", "after-unbind", core.JobInput{Kind: "image"})
	j.ActivationRequired = true
	if _, e = s.Store.CreateJob(ctx, j); !errors.Is(e, core.ErrActivationRequired) {
		t.Fatal("revoked membership admitted", e)
	}
}
