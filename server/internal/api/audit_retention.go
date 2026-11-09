package api

import (
	"context"
	"doubo/server/internal/store"
	"log/slog"
	"time"
)

// RunLogRetention prunes operation logs once a day: writes, sign-ins and
// model calls are kept for writeDays, plain reads (GET) for readDays.
func (a *Server) RunLogRetention(ctx context.Context, writeDays, readDays int) {
	logs, ok := a.Store.(store.AuditLogs)
	if !ok || writeDays < 1 || readDays < 1 {
		return
	}
	for {
		now := time.Now()
		n, err := logs.PruneLogs(ctx, now.AddDate(0, 0, -writeDays), now.AddDate(0, 0, -readDays))
		if err != nil {
			slog.Warn("audit log pruning failed", "error", err)
		} else if n > 0 {
			slog.Info("audit logs pruned", "rows", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(24 * time.Hour):
		}
	}
}
