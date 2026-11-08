package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"fmt"
	"strings"
	"testing"
)

func TestProvidersAreLimitedToThreeLevels(t *testing.T) {
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	policy := core.DefaultDistributionPolicy()
	policy.TotalUserQuota = 100
	if _, err := s.SavePolicy(ctx, policy, 0, "admin"); err != nil {
		t.Fatal(err)
	}
	parent := core.RootPartner
	for level := 1; level <= MaxLevels; level++ {
		r, err := s.Create(ctx, parent, fmt.Sprintf("L%d", level), int64(40-level*10), fmt.Sprintf("create-%d", level), "admin")
		if err != nil {
			t.Fatalf("level %d: %v", level, err)
		}
		parent = r.ID
	}
	_, err := s.Create(ctx, parent, "L4", 1, "create-4", "admin")
	if err == nil || !strings.Contains(err.Error(), "最多 3 级") {
		t.Fatal("a fourth provider level was accepted", err)
	}
}
