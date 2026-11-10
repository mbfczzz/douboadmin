package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/go-sql-driver/mysql"
)

func mysqlFixture(t *testing.T) *MySQL {
	t.Helper()
	dsn := os.Getenv("MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEST_DSN is required for real MySQL tests")
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil || !strings.Contains(cfg.DBName, "_test") {
		t.Fatal("use a dedicated _test database")
	}
	m, err := NewMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Close() })
	if err = m.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestMySQLIndependentInstancesFenceClaimsAndDuplicateRequests(t *testing.T) {
	a, b := mysqlFixture(t), mysqlFixture(t)
	ctx := context.Background()
	j := core.NewJob("integration-"+core.NewID(), "same-key", core.JobInput{Kind: "image", Prompt: "test"})
	t.Cleanup(func() { _, _ = a.db.Exec(`DELETE FROM jobs WHERE id=?`, j.ID) })
	var wg sync.WaitGroup
	var created atomic.Int32
	for i := range 24 {
		db := a
		if i%2 == 1 {
			db = b
		}
		wg.Go(func() {
			out, e := db.CreateJob(ctx, j)
			if e != nil || out.ID != j.ID {
				t.Errorf("create: %v", e)
			} else {
				created.Add(1)
			}
		})
	}
	wg.Wait()
	if created.Load() != 24 {
		t.Fatal("idempotent requests failed")
	}
	var count int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM jobs WHERE id=?`, j.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal(count, err)
	}
	claims := make(chan core.Job, 24)
	for i := range 24 {
		db := a
		if i%2 == 1 {
			db = b
		}
		wg.Go(func() {
			out, e := db.Claim(ctx)
			if e == nil {
				claims <- out
			} else if !errors.Is(e, core.ErrNotFound) {
				t.Errorf("claim: %v", e)
			}
		})
	}
	wg.Wait()
	close(claims)
	if len(claims) != 1 {
		t.Fatal("duplicate workers claimed a job", len(claims))
	}
	old := <-claims
	if err := a.Hold(ctx, old, 0, true); err != nil {
		t.Fatal(err)
	}
	fresh, err := b.Claim(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = a.Finish(ctx, old, "stale", ""); !errors.Is(err, core.ErrConflict) {
		t.Fatal("stale writer accepted", err)
	}
	if err = b.Finish(ctx, fresh, "actual-result", ""); err != nil {
		t.Fatal(err)
	}
	got, err := a.Job(ctx, j.ID)
	if err != nil || got.Result != "actual-result" || got.Demo {
		t.Fatal(got, err)
	}
}

func TestMySQLConcurrentRecordVersionsReturnCommittedContent(t *testing.T) {
	a, b := mysqlFixture(t), mysqlFixture(t)
	ctx := context.Background()
	id := core.NewID()
	t.Cleanup(func() { _, _ = a.db.Exec(`DELETE FROM lock_contract WHERE id=?`, id) })
	r, err := a.Put(ctx, "lock_contract", core.Record{ID: id, Data: json.RawMessage(`{"amountFen":0}`)}, 0)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	var wins atomic.Int32
	for i := range 20 {
		db := a
		if i%2 == 1 {
			db = b
		}
		wg.Go(func() {
			out, e := db.Put(ctx, "lock_contract", core.Record{ID: id, Data: core.Data(map[string]int{"amountFen": i + 1})}, r.Version)
			if e == nil {
				wins.Add(1)
				var value map[string]int
				_ = json.Unmarshal(out.Data, &value)
				if out.Version != 2 || value["amountFen"] != i+1 {
					t.Error("write returned another editor's data")
				}
			}
			if e != nil && !errors.Is(e, core.ErrConflict) {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatal("CAS winners", wins.Load())
	}
}
