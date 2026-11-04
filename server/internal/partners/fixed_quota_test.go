package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"testing"
)

func TestConfiguredRootQuotaIsFixedAndProvidersCostNoQuota(t *testing.T) {
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	policy := core.DefaultDistributionPolicy()
	policy.TotalUserQuota = 2
	if _, err := s.SavePolicy(ctx, policy, 0, "admin"); err != nil {
		t.Fatal(err)
	}
	provider, err := s.Create(ctx, core.RootPartner, "S1", "create-provider", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Transfer(ctx, core.QuotaMove{ParentID: core.RootPartner, ChildID: provider.ID, Users: 2, Kind: "grant", Reason: "固定额度划拨"}, "grant-provider", "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Create(ctx, provider.ID, "S2", "create-child", "admin"); err != nil {
		t.Fatal("provider creation consumed user quota", err)
	}
	if _, err = s.Transfer(ctx, core.QuotaMove{ParentID: core.RootPartner, ChildID: provider.ID, Users: 1, Kind: "grant", Reason: "禁止超发"}, "over-grant", "admin"); !errors.Is(err, core.ErrQuota) {
		t.Fatal("fixed total quota expanded", err)
	}
}
