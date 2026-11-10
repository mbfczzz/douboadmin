package partners

import (
	"doubo/server/internal/core"
	"strings"
	"testing"
)

func TestBindCodeLinksAnAdminCreatedProviderOnce(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "boss", "other")
	bind, e := s.Share(ctx, s1, BindCode, "admin")
	if e != nil || bind.Code == "" || bind.User != "" {
		t.Fatal(bind, e)
	}
	if access := register(t, s, ctx, bind.Code, "boss"); access.PartnerID != s1 {
		t.Fatal(access)
	}
	if _, reg, _ := get[core.Registration](reader{ctx, s.Store}, "registrations", "boss"); reg.Role != core.RoleS1 || reg.CodeKind != BindCode || reg.PartnerID != s1 {
		t.Fatal("registration", reg)
	}
	if v, _ := s.Share(ctx, s1, BindCode, "admin"); v.User != "boss" || v.Code != bind.Code {
		t.Fatal("reserved user", v)
	}
	if _, e = s.Join(ctx, "other", bind.Code, "scan"); e == nil || !strings.Contains(e.Error(), "已使用") {
		t.Fatal("a used bind code worked again", e)
	}
	decide(t, s, ctx, "boss", true)
	if access, _ := s.Access(ctx, "boss"); !access.Active || access.Status != "provider" || access.PartnerID != s1 {
		t.Fatal(access)
	}
	if id, _ := s.OwnedPartner(ctx, "boss"); id != s1 {
		t.Fatal("owner", id)
	}
	// Unbinding releases the account and issues a new code.
	fresh, e := s.Unbind(ctx, s1, "admin")
	if e != nil || fresh.Code == bind.Code || fresh.User != "" {
		t.Fatal(fresh, e)
	}
	if a, _ := s.Access(ctx, "boss"); a.Active || a.Status != "pending" {
		t.Fatal("after unbind", a)
	}
	if _, e = s.OwnedPartner(ctx, "boss"); e == nil {
		t.Fatal("still owner after unbind")
	}
	if _, e = s.Unbind(ctx, s1, "admin"); e == nil {
		t.Fatal("unbound twice")
	}
	register(t, s, ctx, fresh.Code, "other")
}

func TestRejectedBindFreesTheProviderWithANewCode(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "boss")
	bind, _ := s.Share(ctx, s1, BindCode, "admin")
	register(t, s, ctx, bind.Code, "boss")
	decide(t, s, ctx, "boss", false)
	fresh, e := s.Share(ctx, s1, BindCode, "admin")
	if e != nil || fresh.Code == bind.Code || fresh.User != "" {
		t.Fatal("rejection kept the provider reserved", fresh, e)
	}
	// The user sees the rejection and its reason, and may scan again.
	if a, _ := s.Access(ctx, "boss"); a.Active || a.Status != "rejected" || !strings.Contains(a.Message, "资料不符") {
		t.Fatal("after rejection", a)
	}
	if _, e = s.Join(ctx, "boss", bind.Code, "scan"); e == nil {
		t.Fatal("the rejected bind code worked again")
	}
	register(t, s, ctx, fresh.Code, "boss")
	decide(t, s, ctx, "boss", true)
	if id, _ := s.OwnedPartner(ctx, "boss"); id != s1 {
		t.Fatal("owner", id)
	}
}

func TestUnbindWhilePendingRejectsTheRegistration(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "boss", "next")
	bind, _ := s.Share(ctx, s1, BindCode, "admin")
	register(t, s, ctx, bind.Code, "boss")
	fresh, e := s.Unbind(ctx, s1, "admin")
	if e != nil {
		t.Fatal(e)
	}
	register(t, s, ctx, fresh.Code, "next")
	row, reg, _ := get[core.Registration](reader{ctx, s.Store}, "registrations", "boss")
	if reg.Status != "rejected" || reg.Reason != "后台已解除绑定" {
		t.Fatal("pending bind left open", reg)
	}
	for _, approve := range []bool{true, false} {
		if _, e = s.Decide(ctx, "boss", approve, "已解绑", row.Version, "admin"); e == nil || !strings.Contains(e.Error(), "已处理") {
			t.Fatal("a closed bind was decided", approve, e)
		}
	}
	if a, _ := s.Access(ctx, "boss"); a.Status != "rejected" || !strings.Contains(a.Message, "解除绑定") {
		t.Fatal("unbound user", a)
	}
	decide(t, s, ctx, "next", true)
	if v, _ := s.Share(ctx, s1, BindCode, "admin"); v.User != "next" {
		t.Fatal("bound user", v)
	}
}

func TestBindCodeOnlyForAdminCreatedProviders(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "boss")
	id := invite(t, s, ctx, s1, S2Code, "boss")
	if _, e := s.Share(ctx, id, BindCode, "admin"); e == nil {
		t.Fatal("an invite-created provider got a bind code")
	}
	if _, e := s.Share(ctx, core.RootPartner, BindCode, "admin"); e == nil {
		t.Fatal("the platform got a bind code")
	}
}
