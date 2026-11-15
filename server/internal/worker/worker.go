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

func Run(ctx context.Context, s store.Store, p provider.Provider) {
	expireCtx, stopExpiry := context.WithCancel(ctx)
	expiryDone := make(chan struct{})
	go func() { defer close(expiryDone); expireLoop(expireCtx, s) }()
	defer func() { stopExpiry(); <-expiryDone }()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			j, err := s.Claim(ctx)
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
