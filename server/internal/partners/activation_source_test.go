package partners

import (
	"doubo/server/internal/core"
	"testing"
)

func TestActivationSourceShowsChainRegistrationAndReferrer(t *testing.T) {
	s, ctx, branch, s1, s2 := tiers(t)
	addUsers(t, s, ctx, "u1", "u2", "boss")
	if out, e := s.Source(ctx, "u1"); e != nil || out.Kind != "none" || out.Registration != nil || len(out.Chain) != 0 {
		t.Fatal("unregistered user", out, e)
	}
	code, _ := s.ShareCode(ctx, s2, "admin")
	register(t, s, ctx, code, "u1")
	if out, _ := s.Source(ctx, "u1"); out.Kind != "member" || out.Registration == nil || out.Registration.Status != "pending" {
		t.Fatal("pending member", out)
	}
	decide(t, s, ctx, "u1", true)
	out, e := s.Source(ctx, "u1")
	if e != nil || out.Kind != "member" || out.Membership.PartnerID != s2 || out.Membership.CodeID != code || out.Membership.Method != "scan" {
		t.Fatal(out, e)
	}
	want := []SourceNode{{branch, "分公司", core.RoleBranch, "active"}, {s1, "S1", core.RoleS1, "active"}, {s2, "S2", core.RoleS2, "active"}}
	if len(out.Chain) != 3 || out.Chain[0] != want[0] || out.Chain[1] != want[1] || out.Chain[2] != want[2] {
		t.Fatal("provider chain", out.Chain)
	}
	if out.Registration.Status != "approved" || out.Referrer != nil {
		t.Fatal(out.Registration, out.Referrer)
	}
	// A promo code records the promoting member as referrer.
	promo, e := s.PromoCode(ctx, "u1")
	if e != nil {
		t.Fatal(e)
	}
	register(t, s, ctx, promo, "u2")
	if out, _ = s.Source(ctx, "u2"); out.Referrer == nil || out.Referrer.ID != "u1" || out.Referrer.Name != "u1" || out.Registration.Referrer != "u1" {
		t.Fatal("referrer", out.Referrer, out.Registration)
	}
	// An invited provider's owner sees the chain down to their own provider.
	id := invite(t, s, ctx, s1, S2Code, "boss")
	out, e = s.Source(ctx, "boss")
	if e != nil || out.Kind != "owner" || out.OwnerOf != id || len(out.Chain) != 3 || out.Chain[1].ID != s1 || out.Chain[2] != (SourceNode{id, "boss", core.RoleS2, "active"}) {
		t.Fatal("owner", out, e)
	}
	if out.Registration.Role != core.RoleS2 || out.Registration.ParentID != s1 || out.Registration.CodeKind != S2Code {
		t.Fatal("owner registration", out.Registration)
	}
}
