package partners

import (
	"doubo/server/internal/core"
	"testing"
)

func TestActivationSourceShowsChainAndRedeemedCode(t *testing.T) {
	s, ctx, s1, s2 := fixture(t)
	for _, id := range []string{"u1", "u2"} {
		_, _ = s.Store.Put(ctx, "users", core.Record{ID: id, Data: core.Data(map[string]string{"nickname": id})}, 0)
	}
	row, e := s.Issue(ctx, s2, "门店A", 7, "source-code", "admin", "admin")
	if e != nil {
		t.Fatal(e)
	}
	code, e := s.Reveal(ctx, row.ID)
	if e != nil {
		t.Fatal(e)
	}
	if out, e := s.Source(ctx, "u1"); e != nil || out.Kind != "none" {
		t.Fatal("inactive user", out, e)
	}
	if _, e = s.Redeem(ctx, "u1", code, "qr"); e != nil {
		t.Fatal(e)
	}
	out, e := s.Source(ctx, "u1")
	if e != nil || out.Kind != "provider" || out.Membership.PartnerID != s2 {
		t.Fatal(out, e)
	}
	if len(out.Chain) != 2 || out.Chain[0].ID != s1 || out.Chain[0].Level != 1 || out.Chain[1].ID != s2 || out.Chain[1].Level != 2 {
		t.Fatal("provider chain", out.Chain)
	}
	if out.Code == nil || out.Code.Code != code || out.Code.Label != "门店A" || out.Code.Method != "qr" || out.Code.CreatorAccount != "admin" {
		t.Fatal("redeemed code", out.Code)
	}
	if _, e = s.ActivateDirect(ctx, "u2"); e != nil {
		t.Fatal(e)
	}
	if direct, e := s.Source(ctx, "u2"); e != nil || direct.Kind != "direct" || direct.DirectAt == nil || len(direct.Chain) != 0 {
		t.Fatal("direct user", direct, e)
	}
}
