package worker

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"doubo/server/internal/store"
	"errors"
	"log/slog"
	"time"
)

// Run takes any task, checking every second.
func Run(ctx context.Context, s store.Store, p provider.Provider) {
	run(ctx, s, p, s.Claim, time.Second)
}

// RunChat takes only chat turns, checking every 0.3 s: a reply starts at
// once even while every other worker waits on a long image or video.
func RunChat(ctx context.Context, s store.Store, p provider.Provider) {
	run(ctx, s, p, s.ClaimChat, 300*time.Millisecond)
}

func run(ctx context.Context, s store.Store, p provider.Provider, claim func(context.Context) (core.Job, error), every time.Duration) {
	expireCtx, stopExpiry := context.WithCancel(ctx)
	expiryDone := make(chan struct{})
	go func() { defer close(expiryDone); expireLoop(expireCtx, s) }()
	defer func() { stopExpiry(); <-expiryDone }()
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			j, err := claim(ctx)
			if errors.Is(err, core.ErrNotFound) {
				continue
			}
			if err != nil {
				slog.Error("claim task", "error", err)
				continue
			}
			if s.Hold(ctx, j, 180, false) != nil {
				continue
			}
			if core.JobExpired(j, time.Now()) {
				_, _ = s.ExpireJobs(ctx, time.Now(), 100)
				continue
			}
			limit := roundLimit(j, time.Now())
			taskCtx, cancel := context.WithTimeout(ctx, limit)
			stopLease := keepLease(taskCtx, s, j, cancel)
			result, err := p.Generate(taskCtx, j)
			stopLease()
			cancel()
			if ctx.Err() != nil {
				return
			}
			if core.JobExpired(j, time.Now()) {
				_, _ = s.ExpireJobs(ctx, time.Now(), 100)
				continue
			}
			if errors.Is(err, provider.ErrRetryLater) {
				_ = s.Hold(ctx, j, 60, true) // the last step failed; give it a minute
				continue
			}
			if errors.Is(err, provider.ErrPending) {
				_ = s.Hold(ctx, j, 5, true)
				continue
			}
			failure := ""
			if err != nil {
				failure = err.Error()
				j.HoldOnFailure = holdFailedCharge(ctx, s, j.ID, err)
			}
			if err = s.Finish(ctx, j, result, failure); err != nil {
				slog.Warn("completion rejected or unavailable", "task", j.ID, "error", err)
			}
		}
	}
}
