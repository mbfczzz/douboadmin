package worker

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"time"
)

// Encoding can outlive one request lease. Stop work immediately when renewal fails.
func keepLease(ctx context.Context, s store.Store, j core.Job, cancel context.CancelFunc) func() {
	done := make(chan struct{})
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				check, stop := context.WithTimeout(ctx, 5*time.Second)
				err := s.Hold(check, j, 180, false)
				stop()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()
	return func() { close(done); <-stopped }
}
