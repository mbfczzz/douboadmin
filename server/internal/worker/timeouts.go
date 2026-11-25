package worker

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"log/slog"
	"time"
)

func expireLoop(ctx context.Context, s store.Store) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		check, cancel := context.WithTimeout(ctx, 10*time.Second)
		_, err := s.ExpireJobs(check, time.Now().UTC(), 100)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Warn("expire generation tasks", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func roundLimit(j core.Job, now time.Time) time.Duration {
	limit := 130 * time.Second
	// Image submits are synchronous and may run for minutes; mix encodes
	// locally; a chat turn may watch videos and write a long reply.
	// A finished video (up to 500 MB, e.g. Seedance 4K) is copied to storage
	// within one round.
	if j.Input.Kind == "image" || j.Input.Kind == "mix" || j.Input.Kind == "chat" || j.Input.Kind == "video" {
		limit = 10 * time.Minute
	}
	// A 一键复刻 import may upload a video of hundreds of MB to 方舟's Files
	// API before breaking it down.
	if j.Input.Kind == "import" {
		limit = 20 * time.Minute
	}
	if deadline := core.JobDeadline(j); !deadline.IsZero() {
		return min(limit, max(0, deadline.Sub(now)))
	}
	return limit
}
