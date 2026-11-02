package partners

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestActivationTracePreservesIssuerAndFirstRedeemer(t *testing.T) {
	s, ctx, s1, s2 := fixture(t)
	_, _ = s.Store.Put(ctx, "users", core.Record{ID: "user", Owner: "user", Data: core.Data(map[string]string{"nickname": "激活时昵称", "name": "小王", "phone": "private-phone"})}, 0)
	issued, e := s.Issue(ctx, s1, "trace", 7, "trace-code-a", "operator-id", "issuer-account")
	if e != nil {
		t.Fatal(e)
	}
	code, e := s.Reveal(ctx, issued.ID)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Redeem(ctx, "user", code, "qr"); e != nil {
		t.Fatal(e)
	}
	before, e := s.Trace(ctx, issued.ID)
	if e != nil {
		t.Fatal(e)
	}
	var original core.ActivationCode
	_ = json.Unmarshal(before.Record.Data, &original)
	if original.Actor != "operator-id" || original.CreatorAccount != "issuer-account" || original.UserID != "user" || original.ActivatedNickname != "激活时昵称" || original.ActivationMethod != "qr" || original.UsedAt == nil {
		t.Fatal(original)
	}
	if original.PartnerName != "S1" {
		t.Fatal(original.PartnerName)
	}
	profile, _ := s.Store.Get(ctx, "users", "user")
	profile.Data = core.Data(map[string]string{"nickname": "改名后昵称", "name": "小王", "phone": "private-phone"})
	_, _ = s.Store.Put(ctx, "users", profile, profile.Version)
	if _, e = s.Issue(ctx, s1, "trace", 7, "trace-code-a", "operator-id", "renamed-account"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Redeem(ctx, "user", code, "code"); e != nil {
		t.Fatal(e)
	}
	after, _ := s.Trace(ctx, issued.ID)
	if after.Record.Version != before.Record.Version || string(after.Record.Data) != string(before.Record.Data) || after.User.Nickname != "改名后昵称" {
		t.Fatal("history overwritten", after)
	}
	m, _ := s.Store.Get(ctx, "memberships", "user")
	if _, e = s.ChangeMembership(ctx, "user", "unbound", "解除绑定", "operator-id", m.Version); e != nil {
		t.Fatal(e)
	}
	unbound, _ := s.Trace(ctx, issued.ID)
	if unbound.CurrentMembership.Status != "unbound" || string(unbound.Record.Data) != string(before.Record.Data) {
		t.Fatal(unbound)
	}
	_, e = s.Transfer(ctx, core.QuotaMove{ParentID: s1, ChildID: s2, Users: 1, Kind: "grant", Reason: "新归属名额"}, "trace-move", "operator-id")
	if e != nil {
		t.Fatal(e)
	}
	next, e := s.Issue(ctx, s2, "trace second", 7, "trace-code-b", "operator-id", "second-issuer")
	if e != nil {
		t.Fatal(e)
	}
	nextCode, _ := s.Reveal(ctx, next.ID)
	if _, e = s.Redeem(ctx, "user", nextCode, "code"); e != nil {
		t.Fatal(e)
	}
	history, e := s.Trace(ctx, issued.ID)
	if e != nil {
		t.Fatal(e)
	}
	if string(history.Record.Data) != string(before.Record.Data) || history.CurrentMembership.CodeID != next.ID || history.CurrentMembership.PartnerID != s2 {
		t.Fatal("rebind lost original referral", history)
	}
	logs, _ := s.Store.List(ctx, "partner_audit", s1)
	issuedCount := 0
	for _, log := range logs {
		var event struct {
			Kind string `json:"kind"`
		}
		_ = json.Unmarshal(log.Data, &event)
		if event.Kind == "issue_code" {
			issuedCount++
		}
	}
	if issuedCount != 1 {
		t.Fatal("duplicate issue audit", issuedCount)
	}
}
