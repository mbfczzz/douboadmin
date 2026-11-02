package store

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func contracts(t *testing.T, s Store) {
	t.Helper()
	ctx := context.Background()
	user := core.NewID()
	input := core.JobInput{Kind: "image", Prompt: "test", Model: "demo-image", Assets: []string{}}
	job := core.NewJob(user, "repeat-key", input)
	var wg sync.WaitGroup
	for range 32 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			j, e := s.CreateJob(ctx, job)
			if e != nil || j.ID != job.ID {
				t.Errorf("idempotency failed: %v", e)
			}
		}()
	}
	wg.Wait()
	all, e := s.Jobs(ctx, user)
	if e != nil || len(all) != 1 {
		t.Fatalf("expected one job, got %d / %v", len(all), e)
	}
	other := job
	other.Hash = "different"
	if _, e = s.CreateJob(ctx, other); !errors.Is(e, core.ErrIdempotency) {
		t.Fatalf("changed input accepted: %v", e)
	}
	var claimed atomic.Int32
	var winner core.Job
	var mu sync.Mutex
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			j, e := s.Claim(ctx)
			if e == nil {
				claimed.Add(1)
				mu.Lock()
				winner = j
				mu.Unlock()
			} else if !errors.Is(e, core.ErrNotFound) {
				t.Errorf("claim error: %v", e)
			}
		}()
	}
	wg.Wait()
	if claimed.Load() != 1 {
		t.Fatalf("claimed %d times", claimed.Load())
	}
	stale := winner
	stale.LeaseToken = "stale"
	if !errors.Is(s.Finish(ctx, stale, "wrong", ""), core.ErrConflict) {
		t.Fatal("stale worker committed")
	}
	if e = s.Finish(ctx, winner, "correct", ""); e != nil {
		t.Fatal(e)
	}
	if !errors.Is(s.Finish(ctx, winner, "overwritten", ""), core.ErrConflict) {
		t.Fatal("duplicate completion accepted")
	}
	row, e := s.Put(ctx, "test", core.Record{ID: core.NewID(), Data: core.Data(map[string]string{"title": "v1"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	var writes atomic.Int32
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, e := s.Put(ctx, "test", row, 1)
			if e == nil {
				writes.Add(1)
			} else if !errors.Is(e, core.ErrConflict) {
				t.Errorf("update error: %v", e)
			}
		}()
	}
	wg.Wait()
	if writes.Load() != 1 {
		t.Fatalf("optimistic update winners: %d", writes.Load())
	}
}
func TestMemoryContracts(t *testing.T) { contracts(t, NewMemory()) }
func TestExpiredLeaseFencing(t *testing.T) {
	ctx := context.Background()
	s := NewMemory()
	j := core.NewJob("u", "expired-key", core.JobInput{})
	_, _ = s.CreateJob(ctx, j)
	old, _ := s.Claim(ctx)
	s.mu.Lock()
	stored := s.jobs[j.ID]
	stored.LeaseUntil = time.Now().Add(-time.Minute)
	s.jobs[j.ID] = stored
	s.mu.Unlock()
	fresh, e := s.Claim(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if old.LeaseToken == fresh.LeaseToken {
		t.Fatal("lease token did not rotate")
	}
	if !errors.Is(s.Finish(ctx, old, "stale", ""), core.ErrConflict) {
		t.Fatal("old lease accepted")
	}
	if e = s.Finish(ctx, fresh, "fresh", ""); e != nil {
		t.Fatal(e)
	}
}

// Run only against an isolated EMPTY test database; never use a production DSN.
func TestMySQLContracts(t *testing.T) {
	dsn := os.Getenv("DOUBO_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set DOUBO_TEST_MYSQL_DSN to an isolated empty MySQL 8 database")
	}
	s, e := NewMySQL(dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	ctx := context.Background()
	if e = s.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	var count int
	if e = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM jobs").Scan(&count); e != nil || count != 0 {
		t.Fatal("integration DB must contain no tasks")
	}
	contracts(t, s)
	j := core.NewJob(core.NewID(), "lease-recovery", core.JobInput{})
	_, _ = s.CreateJob(ctx, j)
	old, e := s.Claim(ctx)
	if e != nil {
		t.Fatal(e)
	}
	_, e = s.db.ExecContext(ctx, "UPDATE jobs SET lease_until=DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND) WHERE id=?", j.ID)
	if e != nil {
		t.Fatal(e)
	}
	fresh, e := s.Claim(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if !errors.Is(s.Finish(ctx, old, "wrong", ""), core.ErrConflict) {
		t.Fatal("stale mysql lease accepted")
	}
	if e = s.Finish(ctx, fresh, "correct", ""); e != nil {
		t.Fatal(e)
	}
}
