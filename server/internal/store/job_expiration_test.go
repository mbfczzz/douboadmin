package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

func expirationFixture(t *testing.T, kind, phase string, elapsed time.Duration) (*Memory, core.Job) {
	t.Helper()
	s := NewMemory()
	if err := s.Atomic(t.Context(), func(tx Transaction) error {
		_, e := ApplyFunds(tx, core.LedgerEntry{UserID: "user", Reference: "initial", Kind: "admin_adjust", AvailableDelta: 1000})
		return e
	}); err != nil {
		t.Fatal(err)
	}
	j := core.NewJob("user", core.NewID(), core.JobInput{Kind: kind, Prompt: "timeout test"})
	j.CreatedAt = time.Now().UTC().Add(-elapsed)
	j.UpdatedAt = j.CreatedAt
	j.CostUnits = 200
	if _, err := s.CreateJob(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	claimed, err := s.Claim(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if phase != "" {
		if _, err = s.Put(t.Context(), "executions", core.Record{ID: j.ID, Data: core.Data(map[string]any{"phase": phase, "taskId": "upstream-task", "startedAt": time.Now().UTC()})}, 0); err != nil {
			t.Fatal(err)
		}
	}
	return s, claimed
}

func TestExpirationStopsLiveLeaseAndPreservesVerifiedBillingPolicy(t *testing.T) {
	for _, phase := range []string{"", "failed", "polling", "output", "uncertain", "succeeded"} {
		t.Run(phase, func(t *testing.T) {
			s, j := expirationFixture(t, "image", phase, 11*time.Minute)
			if n, err := s.ExpireJobs(t.Context(), time.Now(), 100); err != nil || n != 1 {
				t.Fatal(n, err)
			}
			stored, _ := s.Job(t.Context(), j.ID)
			if stored.Status != "failed" || stored.Error != (&core.JobTimeout{Kind: "image"}).Error() || stored.LeaseToken != "" {
				t.Fatal(stored)
			}
			if err := s.Finish(t.Context(), j, "late-result", ""); !errors.Is(err, core.ErrConflict) {
				t.Fatal("late worker completed expired task", err)
			}
			if err := s.Hold(t.Context(), j, 180, false); !errors.Is(err, core.ErrConflict) {
				t.Fatal("late worker extended lease", err)
			}
			walletRow, _ := s.Get(t.Context(), "wallets", "user")
			var wallet core.Wallet
			_ = json.Unmarshal(walletRow.Data, &wallet)
			hold := phase != "" && phase != "failed"
			if hold && (wallet.Available != 800 || wallet.Held != 200) || !hold && (wallet.Available != 1000 || wallet.Held != 0) {
				t.Fatal("unexpected funds", phase, wallet)
			}
			if phase != "" {
				row, _ := s.Get(t.Context(), "executions", j.ID)
				var data map[string]any
				_ = json.Unmarshal(row.Data, &data)
				if data["phase"] != "timed_out" || data["taskId"] != "upstream-task" {
					t.Fatal("receipt lost", data)
				}
			}
			if n, err := s.ExpireJobs(t.Context(), time.Now(), 100); err != nil || n != 0 {
				t.Fatal(n, err)
			}
			notices, _ := s.List(t.Context(), "notifications", "user")
			if len(notices) != 1 {
				t.Fatal("duplicate timeout notices", len(notices))
			}
			if err := s.Resume(t.Context(), j.ID); !errors.Is(err, core.ErrConflict) {
				t.Fatal("expired task resumed", err)
			}
		})
	}
}

func TestExpirationLeavesSuccessfulAndNotYetExpiredJobsUntouched(t *testing.T) {
	for _, tt := range []struct {
		kind   string
		age    time.Duration
		expire bool
	}{{"image", 9 * time.Minute, false}, {"image", 11 * time.Minute, true}, {"video", 11 * time.Minute, false}, {"video", 61 * time.Minute, true}, {"mix", 61 * time.Minute, true}, {"chat", 2 * time.Hour, false}} {
		s, j := expirationFixture(t, tt.kind, "polling", tt.age)
		n, err := s.ExpireJobs(t.Context(), time.Now(), 100)
		if err != nil || (n == 1) != tt.expire {
			t.Fatal(tt, n, err)
		}
		if !tt.expire {
			stored, _ := s.Job(t.Context(), j.ID)
			if stored.Status != "running" {
				t.Fatal(stored)
			}
		}
	}
	s, j := expirationFixture(t, "image", "", 9*time.Minute)
	if err := s.Finish(t.Context(), j, "https://fixture.test/success.png", ""); err != nil {
		t.Fatal(err)
	}
	if n, err := s.ExpireJobs(t.Context(), time.Now().Add(2*time.Minute), 100); err != nil || n != 0 {
		t.Fatal("completed task expired", n, err)
	}
}

func TestConcurrentExpiryRefundsOnceAndHandlesQueuedJobs(t *testing.T) {
	s, j := expirationFixture(t, "image", "", 11*time.Minute)
	s.mu.Lock()
	queued := s.jobs[j.ID]
	queued.Status, queued.LeaseToken = "queued", ""
	s.jobs[j.ID] = queued
	s.mu.Unlock()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.ExpireJobs(t.Context(), time.Now(), 100); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	row, _ := s.Get(t.Context(), "wallets", "user")
	var wallet core.Wallet
	_ = json.Unmarshal(row.Data, &wallet)
	if wallet.Available != 1000 || wallet.Held != 0 {
		t.Fatal("refund repeated", wallet)
	}
	if _, err := s.Claim(t.Context()); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("expired queued job claimed", err)
	}
}

func TestLateCompletionCannotBeatTimeoutScanner(t *testing.T) {
	s, j := expirationFixture(t, "image", "output", 11*time.Minute)
	if err := s.Finish(t.Context(), j, "late-result", ""); !errors.Is(err, core.ErrConflict) {
		t.Fatal("late success beat deadline", err)
	}
	if n, err := s.ExpireJobs(t.Context(), time.Now(), 100); err != nil || n != 1 {
		t.Fatal(n, err)
	}
}
