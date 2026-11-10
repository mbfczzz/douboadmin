package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"testing"
)

func TestCodeUsesAppearBeforeApprovalAndNeverDuplicate(t *testing.T) {
	for _, kind := range []string{MemberCode, S1Code, S2Code, BindCode} {
		t.Run(kind, func(t *testing.T) {
			s, ctx, branch, _, _ := tiers(t)
			addUsers(t, s, ctx, "scanner")
			share, e := s.Share(ctx, branch, kind, "admin")
			if e != nil {
				t.Fatal(e)
			}
			register(t, s, ctx, share.Code, "scanner")
			id := core.CodeUseID("scanner", share.Code)
			row, e := s.Store.Get(ctx, "code_uses", id)
			var use core.CodeUse
			if e != nil || json.Unmarshal(row.Data, &use) != nil || row.Owner != branch || use.UserID != "scanner" || use.Status != "pending" || use.CodeKind != kind || use.Name != "scanner" {
				t.Fatal("missing pending usage", row, e)
			}
			if _, e = s.Join(ctx, "scanner", share.Code, "scan"); e == nil {
				t.Fatal("duplicate scan accepted")
			}
			unchanged, _ := s.Store.Get(ctx, "code_uses", id)
			if unchanged.Version != row.Version {
				t.Fatal("duplicate overwrote original usage")
			}
			decide(t, s, ctx, "scanner", true)
			row, _ = s.Store.Get(ctx, "code_uses", id)
			_ = json.Unmarshal(row.Data, &use)
			if use.Status != "approved" || use.DecidedAt == nil {
				t.Fatal("approval not reflected in usage", use)
			}
		})
	}
}

func TestRejectedUsageRemainsAfterNewCodeAndReset(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "scanner", "another")
	share, _ := s.Share(ctx, branch, S1Code, "admin")
	register(t, s, ctx, share.Code, "scanner")
	decide(t, s, ctx, "scanner", false)
	if _, e := s.Join(ctx, "scanner", share.Code, "code"); e == nil {
		t.Fatal("same user reused a rejected code")
	}
	register(t, s, ctx, share.Code, "another") // other users may use the same code
	fresh, e := s.ResetShare(ctx, branch, S1Code, "admin")
	if e != nil {
		t.Fatal(e)
	}
	register(t, s, ctx, fresh.Code, "scanner")
	rows, e := s.Store.RecordPage(ctx, core.RecordQuery{Namespace: "code_uses", Owner: branch, Page: 1, Size: 20})
	if e != nil || rows.Total != 3 {
		t.Fatal("historical usage lost", rows.Total, e)
	}
	old, _ := s.Store.Get(ctx, "code_uses", core.CodeUseID("scanner", share.Code))
	var use core.CodeUse
	_ = json.Unmarshal(old.Data, &use)
	if use.Status != "rejected" || use.Reason == "" {
		t.Fatal("old decision overwritten", use)
	}
}

func TestPendingBindUsageUpdatesWhenUnbound(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "scanner")
	share, _ := s.Share(ctx, branch, BindCode, "admin")
	register(t, s, ctx, share.Code, "scanner")
	if _, e := s.Unbind(ctx, branch, "admin"); e != nil {
		t.Fatal(e)
	}
	row, _ := s.Store.Get(ctx, "code_uses", core.CodeUseID("scanner", share.Code))
	var use core.CodeUse
	_ = json.Unmarshal(row.Data, &use)
	if use.Status != "rejected" || use.Reason != "后台已解除绑定" {
		t.Fatal("pending bind history not closed", use)
	}
}

type failingCodeUseStore struct{ store.Store }
type failingCodeUseTx struct{ store.Transaction }

func (s failingCodeUseStore) Atomic(ctx context.Context, fn func(store.Transaction) error) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error { return fn(failingCodeUseTx{tx}) })
}
func (tx failingCodeUseTx) Put(ns string, row core.Record, version int64) (core.Record, error) {
	if ns == "code_uses" {
		return core.Record{}, errors.New("usage write unavailable")
	}
	return tx.Transaction.Put(ns, row, version)
}
func TestUsageAndRegistrationCommitAtomically(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "scanner")
	share, _ := s.Share(ctx, branch, S1Code, "admin")
	wrapped := &Service{Store: failingCodeUseStore{s.Store}}
	if _, e := wrapped.Join(ctx, "scanner", share.Code, "scan"); e == nil {
		t.Fatal("registration succeeded without a usage")
	}
	for _, ns := range []string{"registrations", "partner_owners"} {
		if _, e := s.Store.Get(ctx, ns, "scanner"); !errors.Is(e, core.ErrNotFound) {
			t.Fatal("partial registration left behind", ns, e)
		}
	}
	rows, _ := s.Tree(ctx)
	if len(rows) != 3 {
		t.Fatal("failed usage write created a provider")
	}
}
