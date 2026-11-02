package partners_test

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"errors"
	"testing"
)

type admissionSignalStore struct {
	store.Store
	waiting chan struct{}
}
type admissionSignalTx struct {
	store.Transaction
	waiting chan struct{}
}

func (s *admissionSignalStore) Atomic(ctx context.Context, fn func(store.Transaction) error) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error { return fn(&admissionSignalTx{tx, s.waiting}) })
}
func (tx *admissionSignalTx) Lock(ns string, row core.Record) (core.Record, error) {
	if ns == "wallets" {
		close(tx.waiting)
	}
	return tx.Transaction.Lock(ns, row)
}

func TestMySQLSuspensionWinsAgainstWaitingRedemption(t *testing.T) {
	a, b, ctx := sqlFixture(t)
	p := &partners.Service{Store: a}
	id := makePartner(t, p, ctx)
	_, e := a.Put(ctx, "users", core.Record{ID: "profile-race", Owner: "profile-race", Data: core.Data(map[string]any{"nickname": "race"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	code, e := p.Issue(ctx, id, "race", 7, "profile-race-code", "admin")
	if e != nil {
		t.Fatal(e)
	}
	token, e := p.Reveal(ctx, code.ID)
	if e != nil {
		t.Fatal(e)
	}
	waiting := make(chan struct{})
	finished := make(chan error, 1)
	second := &partners.Service{Store: &admissionSignalStore{b, waiting}}
	e = a.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, err := store.LockWallet(tx, "profile-race"); err != nil {
			return err
		}
		go func() { _, err := second.Redeem(ctx, "profile-race", token); finished <- err }()
		select {
		case <-waiting:
		case <-ctx.Done():
			return ctx.Err()
		}
		row, err := tx.Get("users", "profile-race")
		if err != nil {
			return err
		}
		row.Data = core.Data(map[string]any{"disabled": true})
		_, err = tx.Put("users", row, row.Version)
		return err
	})
	if e != nil {
		t.Fatal(e)
	}
	select {
	case e = <-finished:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	if !errors.Is(e, core.ErrUserDisabled) {
		t.Fatal("waiting redemption bypassed suspension", e)
	}
	v, e := p.Overview(ctx, id)
	if e != nil {
		t.Fatal(e)
	}
	if v.Quota.Users.Reserved != 1 || v.Quota.Users.Used != 0 {
		t.Fatal("quota changed", v.Quota)
	}
}
