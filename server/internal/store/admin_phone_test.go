package store

import (
	"doubo/server/internal/core"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
)

func TestAdminPhoneUniqueAcrossConcurrentWrites(t *testing.T) {
	s := NewMemory()
	var success atomic.Int32
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			row := core.Record{ID: core.NewID(), Data: core.Data(core.AdminAccount{Phone: "13900139000"})}
			_, err := s.Put(t.Context(), "admin_accounts", row, 0)
			if err == nil {
				success.Add(1)
			} else if !errors.Is(err, core.ErrAdminPhoneTaken) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if success.Load() != 1 {
		t.Fatal("duplicate accounts", success.Load())
	}
}

func TestAdminPhoneDisabledReservedArchivedReleasedAndAtomicRollback(t *testing.T) {
	s := NewMemory()
	put := func(id, phone string, disabled, archived bool, version int64) error {
		_, e := s.Put(t.Context(), "admin_accounts", core.Record{ID: id, Data: core.Data(core.AdminAccount{Phone: phone, Disabled: disabled, Archived: archived})}, version)
		return e
	}
	if e := put("one", "13900139000", true, false, 0); e != nil {
		t.Fatal(e)
	}
	if e := put("two", " 13900139000 ", false, false, 0); !errors.Is(e, core.ErrAdminPhoneTaken) {
		t.Fatal(e)
	}
	err := s.Atomic(t.Context(), func(tx Transaction) error {
		_, e := tx.Put("admin_accounts", core.Record{ID: "two", Data: core.Data(core.AdminAccount{Phone: "13900139001"})}, 0)
		if e != nil {
			return e
		}
		_, e = tx.Put("admin_accounts", core.Record{ID: "two", Data: core.Data(core.AdminAccount{Phone: "13900139000"})}, 1)
		return e
	})
	if !errors.Is(err, core.ErrAdminPhoneTaken) {
		t.Fatal(err)
	}
	if _, e := s.Get(t.Context(), "admin_accounts", "two"); !errors.Is(e, core.ErrNotFound) {
		t.Fatal("partial write persisted")
	}
	if e := put("one", "13900139000", true, true, 1); e != nil {
		t.Fatal(e)
	}
	if e := put("two", "13900139000", false, false, 0); e != nil {
		t.Fatal(e)
	}
	for _, id := range []string{"empty-one", "empty-two"} {
		if e := put(id, "", false, false, 0); e != nil {
			t.Fatal(e)
		}
	}
}

func TestMySQLAdminPhoneUnique(t *testing.T) {
	m := mysqlFixture(t)
	tx, e := m.db.BeginTx(t.Context(), nil)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	phone := "test-" + core.NewID()
	one, two := core.NewID(), core.NewID()
	row := core.Record{ID: one, Data: core.Data(core.AdminAccount{Phone: phone, Disabled: true})}
	if e = putRow(t.Context(), tx, "admin_accounts", row, 0); e != nil {
		t.Fatal(e)
	}
	row.ID = two
	if e = putRow(t.Context(), tx, "admin_accounts", row, 0); !errors.Is(e, core.ErrAdminPhoneTaken) {
		t.Fatal(e)
	}
	if _, e = tx.ExecContext(t.Context(), `UPDATE admin_accounts SET archived=1 WHERE id=?`, one); e != nil {
		t.Fatal(e)
	}
	if e = putRow(t.Context(), tx, "admin_accounts", row, 0); e != nil {
		t.Fatal(e)
	}
}
