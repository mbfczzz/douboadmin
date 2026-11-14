package store

import (
	"doubo/server/internal/core"
	"errors"
	"testing"
	"time"
)

func TestPurgeModelGuardsAndPreservesOtherRecords(t *testing.T) {
	m := NewMemory()
	row, err := m.Put(t.Context(), "models", core.Record{ID: "purge-model", Data: core.Data(core.Model{Name: "model"})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = m.PurgeModel(t.Context(), row.ID, row.Version, row.CreatedAt); !errors.Is(err, core.ErrConflict) {
		t.Fatal("active model removed", err)
	}
	row.Data = core.Data(core.Model{Name: "model", Deleted: true})
	row, _ = m.Put(t.Context(), "models", row, row.Version)
	if _, err = m.PurgeModel(t.Context(), row.ID, row.Version-1, row.CreatedAt); !errors.Is(err, core.ErrConflict) {
		t.Fatal("stale version accepted", err)
	}
	if _, err = m.PurgeModel(t.Context(), row.ID, row.Version, row.CreatedAt.Add(-time.Second)); !errors.Is(err, core.ErrConflict) {
		t.Fatal("stale generation accepted", err)
	}
	m.records["templates:keep"] = core.Record{ID: "keep", Data: core.Data(core.Template{GenerationOptions: core.GenerationOptions{Model: row.ID}})}
	m.records["wallets:keep"] = core.Record{ID: "keep", Data: core.Data(map[string]int{"availableUnits": 100})}
	m.jobs["history"] = core.Job{ID: "history", Input: core.JobInput{Model: row.ID}, Status: "succeeded"}
	for _, status := range []string{"queued", "running"} {
		m.jobs["active"] = core.Job{ID: "active", Input: core.JobInput{Model: row.ID}, Status: status}
		if _, err = m.PurgeModel(t.Context(), row.ID, row.Version, row.CreatedAt); !errors.Is(err, core.ErrConflict) {
			t.Fatal("active task lost its model", err)
		}
	}
	delete(m.jobs, "active")
	if _, err = m.PurgeModel(t.Context(), row.ID, row.Version, row.CreatedAt); err != nil {
		t.Fatal(err)
	}
	if _, err = m.Get(t.Context(), "models", row.ID); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("model still exists")
	}
	if len(m.jobs) != 1 || len(m.records) != 2 {
		t.Fatal("unrelated business data changed")
	}
	if _, err = m.PurgeModel(t.Context(), row.ID, row.Version, row.CreatedAt); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("duplicate deletion accepted")
	}
	newRow, err := m.Put(t.Context(), "models", core.Record{ID: row.ID, Data: core.Data(core.Model{Name: "new", Deleted: true})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	newRow, err = m.Put(t.Context(), "models", newRow, newRow.Version)
	if err != nil || newRow.Version != row.Version {
		t.Fatal("fixture must reuse the numeric version", err)
	}
	if _, err = m.PurgeModel(t.Context(), row.ID, row.Version, row.CreatedAt); !errors.Is(err, core.ErrConflict) {
		t.Fatal("old dialog deleted a newly imported generation", err)
	}
}

func TestMySQLPurgeModelRemovesOnlyMatchingDeletedGeneration(t *testing.T) {
	m := mysqlFixture(t)
	id := "purge-" + core.NewID()[:20]
	row, err := m.Put(t.Context(), "models", core.Record{ID: id, Data: core.Data(core.Model{Name: "fixture", Deleted: true})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.db.Exec("DELETE FROM models WHERE id=?", id) })
	if _, err = m.PurgeModel(t.Context(), id, row.Version+1, row.CreatedAt); !errors.Is(err, core.ErrConflict) {
		t.Fatal(err)
	}
	if _, err = m.PurgeModel(t.Context(), id, row.Version, row.CreatedAt); err != nil {
		t.Fatal(err)
	}
	if _, err = m.Get(t.Context(), "models", id); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("SQL deletion did not remove row", err)
	}
	newRow, err := m.Put(t.Context(), "models", core.Record{ID: id, Data: core.Data(core.Model{Name: "new", Deleted: true})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if newRow.CreatedAt.Equal(row.CreatedAt) {
		t.Fatal("fixture requires a new generation")
	}
	if _, err = m.PurgeModel(t.Context(), id, newRow.Version, row.CreatedAt); !errors.Is(err, core.ErrConflict) {
		t.Fatal("old dialog deleted re-imported model", err)
	}
}
