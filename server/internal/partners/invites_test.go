package partners

import (
	"doubo/server/internal/core"
	"strings"
	"testing"
)

func TestInviteRegistersAPendingProviderUntilApproved(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "boss", "fan")
	code, e := s.Share(ctx, branch, S1Code, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if again, _ := s.Share(ctx, branch, S1Code, "admin"); again != code {
		t.Fatal("invite code changed", again, code)
	}
	access := register(t, s, ctx, code.Code, "boss")
	id := access.PartnerID
	p := partnerOf(t, s, ctx, id)
	if p.Status != "pending" || p.Role != core.RoleS1 || p.ParentID != branch || p.OwnerUser != "boss" || p.Name != "boss" || access.PartnerName != partnerOf(t, s, ctx, branch).Name {
		t.Fatal("pending provider", p, access)
	}
	if owned, e := s.OwnedPartner(ctx, "boss"); e != nil || owned != id {
		t.Fatal(owned, e)
	}
	// A provider the platform has not opened yet hands out no codes.
	if _, e = s.ShareCode(ctx, id, "user:boss"); e == nil || !strings.Contains(e.Error(), "开通后") {
		t.Fatal("a pending provider got a code", e)
	}
	decide(t, s, ctx, "boss", true)
	if p = partnerOf(t, s, ctx, id); p.Status != "active" {
		t.Fatal("approved provider", p)
	}
	if access, _ = s.Access(ctx, "boss"); !access.Active || access.Status != "provider" {
		t.Fatal(access)
	}
	join(t, s, ctx, id, "fan")
	if _, e = s.Share(ctx, id, S2Code, "user:boss"); e != nil {
		t.Fatal("an S1 has no S2 invite", e)
	}
	if _, e = s.Share(ctx, id, S1Code, "user:boss"); e == nil {
		t.Fatal("an S1 got an S1 invite")
	}
}

func TestInvitesGrowS1AndS2ButS2GrowsNoProviders(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "s1-boss", "s2-boss", "branch-s2")
	s1 := invite(t, s, ctx, branch, S1Code, "s1-boss")
	s2 := invite(t, s, ctx, s1, S2Code, "s2-boss")
	direct := invite(t, s, ctx, branch, S2Code, "branch-s2")
	for id, want := range map[string][2]string{s1: {core.RoleS1, branch}, s2: {core.RoleS2, s1}, direct: {core.RoleS2, branch}} {
		if p := partnerOf(t, s, ctx, id); p.Role != want[0] || p.ParentID != want[1] {
			t.Fatal("invited provider", p)
		}
	}
	for _, kind := range []string{S1Code, S2Code} {
		if _, e := s.Share(ctx, s2, kind, "user:s2-boss"); e == nil {
			t.Fatal("an S2 got an invite", kind)
		}
	}
	if _, e := s.ShareCode(ctx, s2, "user:s2-boss"); e != nil {
		t.Fatal("an S2 has no member code", e)
	}
}

func TestRejectedInviteClosesTheProviderAndAllowsAnotherScan(t *testing.T) {
	s, ctx, branch, s1, _ := tiers(t)
	addUsers(t, s, ctx, "boss", "member")
	if _, e := s.Store.Put(ctx, "users", core.Record{ID: "late", Data: core.Data(map[string]string{"nickname": "late"})}, 0); e != nil {
		t.Fatal(e)
	}
	code, _ := s.Share(ctx, branch, S1Code, "admin")
	if _, e := s.Join(ctx, "late", code.Code, "scan"); e == nil || !strings.Contains(e.Error(), "姓名") {
		t.Fatal("a provider registered without a name", e)
	}
	join(t, s, ctx, s1, "member")
	if _, e := s.Join(ctx, "member", code.Code, "scan"); e == nil || !strings.Contains(e.Error(), "已开通") {
		t.Fatal("an active member became a provider", e)
	}
	first := register(t, s, ctx, code.Code, "boss").PartnerID
	decide(t, s, ctx, "boss", false)
	if p := partnerOf(t, s, ctx, first); p.Status != "rejected" {
		t.Fatal("rejected provider", p)
	}
	if _, e := s.OwnedPartner(ctx, "boss"); e == nil {
		t.Fatal("rejected owner kept the provider")
	}
	// Editing cannot reopen a rejected registration.
	row, _ := s.Store.Get(ctx, "partners", first)
	edited := partnerOf(t, s, ctx, first)
	edited.Status = "active"
	if out, e := s.Update(ctx, first, edited, row.Version, "admin"); e != nil || !strings.Contains(string(out.Data), `"status":"rejected"`) {
		t.Fatal("a rejected provider was reopened", string(out.Data), e)
	}
	if a, _ := s.Access(ctx, "boss"); a.Active || a.Status != "rejected" {
		t.Fatal(a)
	}
	again := invite(t, s, ctx, branch, S1Code, "boss")
	if again == first || partnerOf(t, s, ctx, first).Status != "rejected" {
		t.Fatal("re-registration reused the rejected provider")
	}
}

// Only the platform's approval opens a scanned provider: editing it in the
// admin keeps it pending, and an approval needs it still pending.
func TestPendingProviderOpensOnlyThroughDecide(t *testing.T) {
	s, ctx, branch, s1, _ := tiers(t)
	addUsers(t, s, ctx, "boss")
	code, _ := s.Share(ctx, branch, S2Code, "admin")
	id := register(t, s, ctx, code.Code, "boss").PartnerID
	view, _ := s.Overview(ctx, id)
	p := partnerOf(t, s, ctx, id)
	p.Name, p.Status = "改名", "active"
	if _, e := s.Update(ctx, id, p, view.Record.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	if p = partnerOf(t, s, ctx, id); p.Status != "pending" || p.Name != "改名" || p.OwnerUser != "boss" {
		t.Fatal("edit opened a pending provider", p)
	}
	if a, _ := s.Access(ctx, "boss"); a.Active {
		t.Fatal("owner active before approval", a)
	}
	open, _ := s.Overview(ctx, s1)
	q := partnerOf(t, s, ctx, s1)
	q.Status = "pending"
	if _, e := s.Update(ctx, s1, q, open.Record.Version, "admin"); e != nil || partnerOf(t, s, ctx, s1).Status != "active" {
		t.Fatal("an active provider went back to pending", e)
	}
	// A provider no longer pending (changed outside Decide) is not decided.
	row, _ := s.Store.Get(ctx, "partners", id)
	p.Status = "disabled"
	if _, e := s.Store.Put(ctx, "partners", core.Record{ID: id, Owner: row.Owner, Data: core.Data(p)}, row.Version); e != nil {
		t.Fatal(e)
	}
	reg, _ := s.Store.Get(ctx, "registrations", "boss")
	if _, e := s.Decide(ctx, "boss", true, "", reg.Version, "admin"); e == nil || !strings.Contains(e.Error(), "待开通") {
		t.Fatal("decided a provider that is no longer pending", e)
	}
}
