package partners

import (
	"doubo/server/internal/core"
	"strings"
	"testing"
)

// An unbound member who later runs a provider buys without commission, even
// with pricing disabled, because an owner's own purchases carry none.
func TestFormerMemberOwnerGetsNoCommissionSnapshot(t *testing.T) {
	s, ctx, branch, s1, _ := tiers(t)
	addUsers(t, s, ctx, "boss")
	join(t, s, ctx, s1, "boss")
	row, _ := s.Store.Get(ctx, "memberships", "boss")
	if _, e := s.ChangeMembership(ctx, "boss", "unbound", "转为服务商", "admin", row.Version); e != nil {
		t.Fatal(e)
	}
	invite(t, s, ctx, branch, S1Code, "boss")
	snapshot, _, e := s.UserQuote(ctx, "boss", 10000, 100)
	if e != nil || snapshot != nil {
		t.Fatal("owner was given a commission snapshot", snapshot, e)
	}
}

// A member code the platform issued before 分公司 existed registers nobody.
func TestOldPlatformMemberCodeIsRefused(t *testing.T) {
	s, ctx, _, _, _ := tiers(t)
	addUsers(t, s, ctx, "late")
	if _, e := s.Store.Put(ctx, "share_codes", core.Record{ID: "RTTCDF23", Owner: core.RootPartner, Data: core.Data(core.ShareCode{PartnerID: core.RootPartner, Status: "active"})}, 0); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Join(ctx, "late", "RTTCDF23", "scan"); e == nil || !strings.Contains(e.Error(), "平台") {
		t.Fatal("an old platform code registered a member", e)
	}
	if _, e := s.Store.Get(ctx, "registrations", "late"); e == nil {
		t.Fatal("a refused scan left a registration")
	}
}
