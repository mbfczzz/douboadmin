package worker

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"doubo/server/internal/store"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

type timeoutProvider struct{ calls atomic.Int64 }

type pendingUntilCanceled struct {
	entered chan struct{}
	calls   atomic.Int64
}

func (p *pendingUntilCanceled) Generate(ctx context.Context, _ core.Job) (string, error) {
	p.calls.Add(1)
	select {
	case p.entered <- struct{}{}:
	default:
	}
	<-ctx.Done()
	return "", provider.ErrRetryLater
}

func TestWorkerCancelsAnInFlightCallAtTotalDeadline(t *testing.T) {
	s := &expiryNoticeStore{Store: store.NewMemory(), expired: make(chan struct{}, 1)}
	j := core.NewJob("u", "in-flight-expiration", core.JobInput{Kind: "image"})
	j.CreatedAt = time.Now().Add(-10*time.Minute + 3*time.Second)
	if _, err := s.CreateJob(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	p := &pendingUntilCanceled{entered: make(chan struct{}, 1)}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	done := make(chan struct{})
	go func() { defer close(done); Run(ctx, s, p) }()
	select {
	case <-p.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("worker never entered pending provider")
	}
	select {
	case <-s.expired:
	case <-time.After(4 * time.Second):
		t.Fatal("in-flight provider extended total deadline")
	}
	stored, _ := s.Job(t.Context(), j.ID)
	if stored.Status != "failed" || p.calls.Load() != 1 {
		t.Fatal("pending job was re-polled", stored.Status, p.calls.Load())
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("worker stuck after timeout")
	}
}

func (p *timeoutProvider) Generate(context.Context, core.Job) (string, error) {
	p.calls.Add(1)
	return "", errors.New("must not generate expired jobs")
}

type expiryNoticeStore struct {
	store.Store
	expired chan struct{}
}

func (s *expiryNoticeStore) ExpireJobs(ctx context.Context, now time.Time, limit int) (int, error) {
	n, err := s.Store.ExpireJobs(ctx, now, limit)
	if n > 0 {
		select {
		case s.expired <- struct{}{}:
		default:
		}
	}
	return n, err
}

func TestWorkerExpiresExistingTaskAtStartupWithoutCallingProvider(t *testing.T) {
	s := &expiryNoticeStore{Store: store.NewMemory(), expired: make(chan struct{}, 1)}
	j := core.NewJob("u", "startup-expired", core.JobInput{Kind: "image"})
	j.CreatedAt = time.Now().Add(-11 * time.Minute)
	if _, err := s.CreateJob(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	provider := &timeoutProvider{}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	done := make(chan struct{})
	go func() { defer close(done); Run(ctx, s, provider) }()
	select {
	case <-s.expired:
	case <-time.After(4 * time.Second):
		t.Fatal("startup sweep did not expire task")
	}
	stored, _ := s.Job(t.Context(), j.ID)
	if stored.Status != "failed" || provider.calls.Load() != 0 {
		t.Fatal(stored.Status, provider.calls.Load())
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timeout monitor did not stop")
	}
}

func TestRoundLimitNeverExtendsTheTaskDeadline(t *testing.T) {
	now := time.Now()
	j := core.NewJob("u", "limit", core.JobInput{Kind: "image"})
	j.CreatedAt = now.Add(-10*time.Minute + 150*time.Millisecond)
	if roundLimit(j, now) != 150*time.Millisecond {
		t.Fatal("image round exceeded deadline", roundLimit(j, now))
	}
	if roundLimit(j, now.Add(time.Second)) != 0 {
		t.Fatal("expired task got another execution window")
	}
	j.Input.Kind = "video"
	j.CreatedAt = now.Add(-time.Hour + time.Second)
	if roundLimit(j, now) != time.Second {
		t.Fatal("video round exceeded deadline")
	}
}

func TestImageRoundWaitsForSlowSynchronousSubmit(t *testing.T) {
	now := time.Now()
	j := core.NewJob("u", "slow", core.JobInput{Kind: "image"})
	j.CreatedAt = now
	if got := roundLimit(j, now); got != 10*time.Minute {
		t.Fatal("4K image submit would be cut off early", got)
	}
	j.Input.Kind = "video"
	if got := roundLimit(j, now); got != 130*time.Second {
		t.Fatal("async video round should stay short", got)
	}
}
