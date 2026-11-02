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
			limit := 130 * time.Second
			if j.Input.Kind == "mix" {
				limit = 10 * time.Minute
			}
			taskCtx, cancel := context.WithTimeout(ctx, limit)
			stopLease := keepLease(taskCtx, s, j, cancel)
			result, err := p.Generate(taskCtx, j)
			stopLease()
			cancel()
			if ctx.Err() != nil {
				return
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
