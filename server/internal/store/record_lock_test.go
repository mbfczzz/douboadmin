package store

import (
	"doubo/server/internal/core"
	"errors"
	"fmt"
	"testing"
)

func TestRecordLockContracts(t *testing.T) {
	t.Run("memory", func(t *testing.T) { recordLockContracts(t, NewMemory()) })
	t.Run("mysql", func(t *testing.T) {
		s := mysqlFixture(t)
		recordLockContracts(t, s)
	})
}

func recordLockContracts(t *testing.T, s Store) {
	t.Helper()
	id, missing := core.NewID(), core.NewID()
	original, err := s.Put(t.Context(), "lock_contract", core.Record{
		ID: id, Owner: "lock-test", Data: core.Data(map[string]any{"status": "created", "amountFen": 10, "pointsUnits": 1000000}),
	}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if db, ok := s.(*MySQL); ok {
		t.Cleanup(func() {
			_, _ = db.db.Exec(`DELETE FROM lock_contract WHERE id IN (?,?)`, id, missing)
		})
	}
	t.Run("existing record locks without initializer and preserves contents", func(t *testing.T) {
		err := s.Atomic(t.Context(), func(tx Transaction) error {
			row, err := tx.Lock("lock_contract", core.Record{ID: id})
			if err != nil {
				return err
			}
			if row.Owner != original.Owner || row.Version != original.Version || string(row.Data) != string(original.Data) {
				return fmt.Errorf("locking changed the existing financial snapshot")
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	})
	t.Run("missing record without initializer never creates a placeholder", func(t *testing.T) {
		err := s.Atomic(t.Context(), func(tx Transaction) error {
			_, err := tx.Lock("lock_contract", core.Record{ID: missing})
			return err
		})
		if !errors.Is(err, core.ErrNotFound) {
			t.Fatal("expected an existing record, got", err)
		}
		if _, err = s.Get(t.Context(), "lock_contract", missing); !errors.Is(err, core.ErrNotFound) {
			t.Fatal("lock created an empty financial record", err)
		}
	})
}
