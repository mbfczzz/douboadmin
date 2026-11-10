package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
	"testing"
)

// After a provider data reset an old order's refund finds no commission
// settlement and has nothing to reverse.
func TestRefundWithoutSettlementReversesNothing(t *testing.T) {
	s, ctx, _, _, _ := tiers(t)
	o := core.Order{UserID: "u", Distribution: &core.DistributionSnapshot{PartnerID: "gone", Shares: []core.CommissionShare{{PartnerID: "gone", AmountFen: 10}}}}
	if e := s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := HoldCommissionRefund(tx, "old-order", "refund-1", o); e != nil {
			return e
		}
		return FinishCommissionRefund(tx, "old-order", "refund-1", o, true)
	}); e != nil {
		t.Fatal(e)
	}
}

// A rejected bind retires its code, and only the current bind code binds.
func TestRetiredBindCodesNeverBind(t *testing.T) {
	s, ctx, _, s1, _ := tiers(t)
	addUsers(t, s, ctx, "boss", "late")
	first, _ := s.Share(ctx, s1, BindCode, "admin")
	register(t, s, ctx, first.Code, "boss")
	decide(t, s, ctx, "boss", false)
	if _, e := s.Join(ctx, "late", first.Code, "scan"); e == nil {
		t.Fatal("a rejected bind code worked")
	}
	current, _ := s.Share(ctx, s1, BindCode, "admin")
	reset, _ := s.ResetShare(ctx, s1, BindCode, "admin")
	if _, e := s.Join(ctx, "late", current.Code, "scan"); e == nil {
		t.Fatal("a reset bind code worked")
	}
	register(t, s, ctx, reset.Code, "late")
}

// The platform cannot open an account that was suspended meanwhile.
func TestApprovalNeedsAnEnabledAccount(t *testing.T) {
	s, ctx, _, s1, _ := tiers(t)
	addUsers(t, s, ctx, "gone")
	code, _ := s.ShareCode(ctx, s1, "admin")
	register(t, s, ctx, code, "gone")
	row, _ := s.Store.Get(ctx, "users", "gone")
	if _, e := s.Store.Put(ctx, "users", core.Record{ID: "gone", Data: core.Data(map[string]any{"nickname": "gone", "disabled": true})}, row.Version); e != nil {
		t.Fatal(e)
	}
	reg, _ := s.Store.Get(ctx, "registrations", "gone")
	if _, e := s.Decide(ctx, "gone", true, "", reg.Version, "admin"); e == nil || !strings.Contains(e.Error(), "只能拒绝") {
		t.Fatal("a disabled account was opened", e)
	}
	if _, e := s.Decide(ctx, "gone", false, "账号已停用", reg.Version, "admin"); e != nil {
		t.Fatal(e)
	}
}

func TestSameOrderPartner(t *testing.T) {
	snap := &core.DistributionSnapshot{PartnerID: "p1"}
	for _, c := range []struct {
		access core.Access
		order  core.Order
		same   bool
	}{
		{core.Access{Status: "active", PartnerID: "p1"}, core.Order{Distribution: snap}, true},
		{core.Access{Status: "active", PartnerID: "p2"}, core.Order{Distribution: snap}, false},
		{core.Access{Status: "provider", PartnerID: "p1"}, core.Order{}, true},
		{core.Access{Status: "provider", PartnerID: "p1"}, core.Order{Distribution: snap}, false},
		{core.Access{Status: "active", PartnerID: "p1"}, core.Order{}, false},
	} {
		if SameOrderPartner(c.access, c.order) != c.same {
			t.Fatal(c)
		}
	}
}
