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

func TestMySQLSuspensionWinsAgainstWaitingJoin(t *testing.T) {
	a, b, ctx := sqlFixture(t)
	p := &partners.Service{Store: a}
	id := makePartner(t, p, ctx)
	_, e := a.Put(ctx, "users", core.Record{ID: "profile-race", Owner: "profile-race", Data: core.Data(map[string]any{"nickname": "race"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	code, e := p.ShareCode(ctx, id, "admin")
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
		go func() { _, err := second.Join(ctx, "profile-race", code, "scan"); finished <- err }()
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
		t.Fatal("waiting join bypassed suspension", e)
	}
	for _, ns := range []string{"registrations", "memberships"} {
		if _, e = p.Store.Get(ctx, ns, "profile-race"); !errors.Is(e, core.ErrNotFound) {
			t.Fatal("suspended user was registered", ns, e)
		}
	}
}
