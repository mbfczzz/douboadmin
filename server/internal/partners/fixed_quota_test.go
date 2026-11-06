package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"testing"
)

func TestTopLevelQuotaIsIndependentAndChildCreationConsumesParentQuota(t *testing.T) {
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	policy := core.DefaultDistributionPolicy()
	policy.TotalUserQuota = 2
	if _, err := s.SavePolicy(ctx, policy, 0, "admin"); err != nil {
		t.Fatal(err)
	}
	provider, err := s.Create(ctx, core.RootPartner, "S1", 10, "create-provider", "admin")
	if err != nil {
		t.Fatal(err)
	}
	view, err := s.Overview(ctx, provider.ID)
	if err != nil || view.Quota.Users.Granted != 10 {
		t.Fatal(view.Quota, err)
	}
	if _, err = s.Create(ctx, provider.ID, "S2", 6, "create-child", "admin"); err != nil {
		t.Fatal(err)
	}
	view, _ = s.Overview(ctx, provider.ID)
	if view.Quota.Users.Allocated != 6 || view.Quota.Users.Available() != 4 {
		t.Fatal(view.Quota)
	}
	before, _ := s.Store.List(ctx, "partners", "")
	if _, err = s.Create(ctx, provider.ID, "S3", 5, "over-create", "admin"); !errors.Is(err, core.ErrQuota) {
		t.Fatal("child quota exceeded parent availability", err)
	}
	after, _ := s.Store.List(ctx, "partners", "")
	if len(after) != len(before) {
		t.Fatal("failed quota allocation did not roll back partner creation")
	}
}
