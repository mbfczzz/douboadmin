package partners

import (
	"doubo/server/internal/core"
	"strings"
	"testing"
)

func TestPromoCodeIsForActiveMembersOnly(t *testing.T) {
	s, ctx, branch, s1, _ := tiers(t)
	addUsers(t, s, ctx, "fan", "pending", "boss")
	if _, e := s.PromoCode(ctx, "fan"); e == nil {
		t.Fatal("an unregistered user got a promo code")
	}
	code, _ := s.ShareCode(ctx, s1, "admin")
	register(t, s, ctx, code, "pending")
	if _, e := s.PromoCode(ctx, "pending"); e == nil {
		t.Fatal("a pending member got a promo code")
	}
	invite(t, s, ctx, branch, S1Code, "boss")
	if _, e := s.PromoCode(ctx, "boss"); e == nil {
		t.Fatal("a provider owner got a promo code")
	}
	join(t, s, ctx, s1, "fan")
	promo, e := s.PromoCode(ctx, "fan")
	if e != nil || len(promo) != 8 {
		t.Fatal(promo, e)
	}
	if again, _ := s.PromoCode(ctx, "fan"); again != promo {
		t.Fatal("promo code changed", again)
	}
	if _, sc, _ := get[core.ShareCode](reader{ctx, s.Store}, "share_codes", promo); sc.Kind != PromoCode || sc.User != "fan" || sc.PartnerID != s1 {
		t.Fatal("stored promo code", sc)
	}
}

func TestPromoRegistrationJoinsTheReferrersProvider(t *testing.T) {
	s, ctx, _, _, s2 := tiers(t)
	addUsers(t, s, ctx, "fan", "friend", "late")
	join(t, s, ctx, s2, "fan")
	promo, _ := s.PromoCode(ctx, "fan")
	if _, e := s.Join(ctx, "fan", promo, "scan"); e == nil {
		t.Fatal("a member used their own promo code")
	}
	access := register(t, s, ctx, promo, "friend")
	if access.PartnerID != s2 {
		t.Fatal("promo joined another provider", access)
	}
	_, m, _ := get[core.Membership](reader{ctx, s.Store}, "memberships", "friend")
	_, reg, _ := get[core.Registration](reader{ctx, s.Store}, "registrations", "friend")
	if m.Referrer != "fan" || m.Status != "pending" || reg.Referrer != "fan" || reg.CodeKind != PromoCode || reg.Role != "member" {
		t.Fatal("referrer", m, reg)
	}
	decide(t, s, ctx, "friend", true)
	if a, _ := s.Access(ctx, "friend"); !a.Active || a.PartnerID != s2 {
		t.Fatal(a)
	}
	// Once the referrer is no longer active the code stops working.
	row, _ := s.Store.Get(ctx, "memberships", "fan")
	if _, e := s.ChangeMembership(ctx, "fan", "disabled", "暂停推广", "admin", row.Version); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Join(ctx, "late", promo, "scan"); e == nil || !strings.Contains(e.Error(), "推广码已失效") {
		t.Fatal("an inactive referrer's code registered", e)
	}
	if _, e := s.Store.Get(ctx, "registrations", "late"); e == nil {
		t.Fatal("a refused promo scan left a registration")
	}
}
