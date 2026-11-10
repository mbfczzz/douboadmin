package partners

import (
	"doubo/server/internal/core"
	"testing"
)

// Which codes each provider holds: the platform none; every provider a 会员
// code; S1 invites for a 分公司; S2 invites for a 分公司 and an S1; bind
// codes for providers made in the admin.
func TestCodesFollowTheProviderRole(t *testing.T) {
	s, ctx, branch, s1, s2 := tiers(t)
	cases := []struct {
		id    string
		holds map[string]bool
	}{
		{core.RootPartner, map[string]bool{}},
		{branch, map[string]bool{MemberCode: true, S1Code: true, S2Code: true, BindCode: true}},
		{s1, map[string]bool{MemberCode: true, S2Code: true, BindCode: true}},
		{s2, map[string]bool{MemberCode: true, BindCode: true}},
	}
	seen := map[string]bool{}
	for _, c := range cases {
		for _, kind := range []string{MemberCode, S1Code, S2Code, BindCode, PromoCode, "other"} {
			v, e := s.Share(ctx, c.id, kind, "admin")
			if (e == nil) != c.holds[kind] {
				t.Fatalf("%s kind %q: %v", partnerOf(t, s, ctx, c.id).Name, kind, e)
			}
			if e != nil {
				continue
			}
			if seen[v.Code] {
				t.Fatal("codes collide", v.Code)
			}
			seen[v.Code] = true
			if _, sc, _ := get[core.ShareCode](reader{ctx, s.Store}, "share_codes", v.Code); sc.PartnerID != c.id || sc.Kind != kind || sc.Status != "active" {
				t.Fatal("stored code", sc)
			}
		}
	}
	if _, e := s.ShareCode(ctx, core.RootPartner, "admin"); e == nil {
		t.Fatal("the platform got a member code")
	}
	if _, e := s.ResetShare(ctx, s2, S2Code, "admin"); e == nil {
		t.Fatal("an S2 reset an invite it cannot hold")
	}
}

// The admin adds providers by the same growth rules: the platform adds a
// 分公司, a 分公司 adds S1 and S2, an S1 adds S2 and an S2 nothing.
func TestCreateFollowsGrowthRules(t *testing.T) {
	s, ctx, branch, s1, s2 := tiers(t)
	for _, c := range []struct {
		parent, role string
		ok           bool
	}{
		{core.RootPartner, core.RoleBranch, true},
		{core.RootPartner, core.RoleS1, false},
		{core.RootPartner, core.RoleS2, false},
		{branch, core.RoleBranch, false},
		{branch, core.RoleS1, true},
		{branch, core.RoleS2, true},
		{s1, core.RoleS1, false},
		{s1, core.RoleS2, true},
		{s2, core.RoleS2, false},
		{s2, "", false},
	} {
		key := "grow-" + c.parent + "-" + c.role
		r, e := s.Create(ctx, c.parent, "新服务商", c.role, key, "admin")
		if (e == nil) != c.ok {
			t.Fatal(c, e)
		}
		if e != nil {
			continue
		}
		p := partnerOf(t, s, ctx, r.ID)
		if p.Role != c.role || p.ParentID != c.parent || p.Status != "active" || p.OwnerUser != "" || p.Path[len(p.Path)-1] != c.parent {
			t.Fatal("created", p)
		}
	}
	if _, e := s.Create(ctx, branch, " ", core.RoleS1, "grow-blank", "admin"); e == nil {
		t.Fatal("blank name accepted")
	}
	rows, _ := s.Tree(ctx)
	if len(rows) != 3+4 {
		t.Fatal("tree", len(rows))
	}
}
