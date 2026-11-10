package partners

import (
	"doubo/server/internal/core"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func TestScanRegistersAndOnlyApprovalOpensTheAccount(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "a")
	code, e := s.ShareCode(ctx, s1, "admin")
	if e != nil || len(code) != 8 {
		t.Fatal(code, e)
	}
	if again, e := s.ShareCode(ctx, s1, "admin"); e != nil || again != code {
		t.Fatal("share code changed", again, e)
	}
	if _, e = s.Join(ctx, "a", code, "link"); e == nil {
		t.Fatal("unknown method accepted")
	}
	if _, e = s.Join(ctx, "a", "short", "code"); e == nil {
		t.Fatal("malformed code accepted")
	}
	typed := strings.ToLower(code[:4]) + "-" + code[4:]
	access, e := s.Join(ctx, "a", typed, "code")
	if e != nil || access.Active || access.Status != "review" || access.PartnerID != s1 || access.Message != reviewMessage {
		t.Fatal(access, e)
	}
	_, reg, e := get[core.Registration](reader{ctx, s.Store}, "registrations", "a")
	if e != nil || reg.Role != "member" || reg.PartnerID != s1 || reg.CodeKind != MemberCode || reg.Code != code || reg.Method != "code" || reg.Name != "a" || reg.Status != "pending" {
		t.Fatal("registration", reg, e)
	}
	if _, m, _ := get[core.Membership](reader{ctx, s.Store}, "memberships", "a"); m.Status != "pending" || m.CodeID != code {
		t.Fatal("membership", m)
	}
	if _, e = s.Join(ctx, "a", code, "scan"); e == nil || !strings.Contains(e.Error(), "等待总部开通") {
		t.Fatal("registered twice while in review", e)
	}
	decide(t, s, ctx, "a", true)
	if access, e = s.Access(ctx, "a"); e != nil || !access.Active || access.Status != "active" {
		t.Fatal(access, e)
	}
	if _, reg, _ = get[core.Registration](reader{ctx, s.Store}, "registrations", "a"); reg.Status != "approved" || reg.DecidedBy != "admin" || reg.DecidedAt == nil {
		t.Fatal("decision", reg)
	}
	if _, e = s.Join(ctx, "a", code, "scan"); e == nil || !strings.Contains(e.Error(), "已开通") {
		t.Fatal("an active member registered again", e)
	}
}

func TestDecideChecksReasonVersionAndRejectionAllowsAnotherScan(t *testing.T) {
	s, ctx, s1, s2 := fixture(t)
	addUsers(t, s, ctx, "a")
	code, _ := s.ShareCode(ctx, s1, "admin")
	register(t, s, ctx, code, "a")
	row, _ := s.Store.Get(ctx, "registrations", "a")
	if _, e := s.Decide(ctx, "a", false, " 不", row.Version, "admin"); e == nil {
		t.Fatal("rejected without a reason")
	}
	if _, e := s.Decide(ctx, "a", true, "", row.Version+1, "admin"); !errors.Is(e, core.ErrConflict) {
		t.Fatal("stale version accepted", e)
	}
	decided, e := s.Decide(ctx, "a", false, "资料不符", row.Version, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Decide(ctx, "a", true, "", decided.Version, "admin"); e == nil || !strings.Contains(e.Error(), "已处理") {
		t.Fatal("decided twice", e)
	}
	if access, _ := s.Access(ctx, "a"); access.Active || access.Status != "rejected" {
		t.Fatal("after rejection", access)
	}
	other, _ := s.ShareCode(ctx, s2, "admin")
	if access := register(t, s, ctx, other, "a"); access.PartnerID != s2 {
		t.Fatal("re-registration", access)
	}
	decide(t, s, ctx, "a", true)
	if access, _ := s.Access(ctx, "a"); !access.Active || access.PartnerID != s2 {
		t.Fatal(access)
	}
}

func TestDisableUnbindAndRegisterAgain(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "a", "p")
	code, _ := s.ShareCode(ctx, s1, "admin")
	register(t, s, ctx, code, "p")
	pending, _ := s.Store.Get(ctx, "memberships", "p")
	if _, e := s.ChangeMembership(ctx, "p", "active", "提前开通", "admin", pending.Version); e == nil {
		t.Fatal("membership change bypassed the platform's approval")
	}
	join(t, s, ctx, s1, "a")
	row, _ := s.Store.Get(ctx, "memberships", "a")
	disabled, e := s.ChangeMembership(ctx, "a", "disabled", "暂停授权", "admin", row.Version)
	if e != nil {
		t.Fatal(e)
	}
	if access, _ := s.Access(ctx, "a"); access.Active || access.Status != "disabled" {
		t.Fatal(access)
	}
	if _, e = s.Join(ctx, "a", code, "scan"); e == nil {
		t.Fatal("a disabled member registered again")
	}
	if _, e = s.ChangeMembership(ctx, "a", "unbound", "解除绑定", "admin", disabled.Version); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Join(ctx, "a", code, "scan"); e == nil {
		t.Fatal("same code reused after unbind")
	}
	fresh, e := s.ResetShare(ctx, s1, MemberCode, "admin")
	if e != nil {
		t.Fatal(e)
	}
	code = fresh.Code
	register(t, s, ctx, code, "a")
	decide(t, s, ctx, "a", true)
	if access, _ := s.Access(ctx, "a"); !access.Active {
		t.Fatal("re-join after unbind", access)
	}
}

func TestConcurrentScansRegisterEveryoneButEachUserOnce(t *testing.T) {
	s, ctx, s1, s2 := fixture(t)
	users := []string{"u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7"}
	addUsers(t, s, ctx, users...)
	one, _ := s.ShareCode(ctx, s1, "admin")
	two, _ := s.ShareCode(ctx, s2, "admin")
	var wins atomic.Int32
	var wg sync.WaitGroup
	for _, id := range users {
		for _, code := range []string{one, two} {
			wg.Go(func() {
				access, e := s.Join(ctx, id, code, "scan")
				var rule *RuleError
				switch {
				case e == nil && access.Status == "review":
					wins.Add(1)
				case !errors.As(e, &rule):
					t.Error(e)
				}
			})
		}
	}
	wg.Wait()
	rows, _ := s.Store.List(ctx, "registrations", "")
	if wins.Load() != int32(len(users)) || len(rows) != len(users) {
		t.Fatal("registrations", wins.Load(), len(rows))
	}
}

func TestResetShareCodeKeepsMembers(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	addUsers(t, s, ctx, "a", "b")
	join(t, s, ctx, s1, "a")
	old, _ := s.ShareCode(ctx, s1, "admin")
	fresh, e := s.ResetShare(ctx, s1, MemberCode, "admin")
	if e != nil || fresh.Code == old {
		t.Fatal(fresh, e)
	}
	if current, _ := s.ShareCode(ctx, s1, "admin"); current != fresh.Code {
		t.Fatal("reset code not current", current)
	}
	if _, e = s.Join(ctx, "b", old, "scan"); e == nil || !strings.Contains(e.Error(), "已重置") {
		t.Fatal("old code still registers", e)
	}
	if access, e := s.Access(ctx, "a"); e != nil || !access.Active {
		t.Fatal("reset dropped a member", access, e)
	}
	register(t, s, ctx, fresh.Code, "b")
}
