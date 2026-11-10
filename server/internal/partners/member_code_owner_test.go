package partners

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestMemberOpeningCodeBelongsToItsIssuingProvider(t *testing.T) {
	s, ctx, branch, s1, s2 := tiers(t)
	users := []string{"branch-member", "s1-member", "s2-member"}
	addUsers(t, s, ctx, users...)
	codes := map[string]bool{}
	for i, provider := range []string{branch, s1, s2} {
		share, err := s.Share(ctx, provider, MemberCode, "admin")
		if err != nil || codes[share.Code] {
			t.Fatal("providers did not receive distinct opening codes", err)
		}
		codes[share.Code] = true
		register(t, s, ctx, share.Code, users[i])
		row, err := s.Store.Get(ctx, "memberships", users[i])
		var membership core.Membership
		if err != nil || json.Unmarshal(row.Data, &membership) != nil || membership.PartnerID != provider || membership.Status != "pending" {
			t.Fatal("opening code assigned a member to another provider", provider, membership, err)
		}
		decide(t, s, ctx, users[i], true)
		access, err := s.Access(ctx, users[i])
		if err != nil || !access.Active || access.PartnerID != provider {
			t.Fatal("approval changed the issuing provider ownership", access, err)
		}
	}
}
