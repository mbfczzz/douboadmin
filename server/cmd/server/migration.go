package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// Schema creation and legacy imports need their own budget, starting after
// connectivity succeeds. Keep the systemd oneshot timeout longer than this.
const migrationTimeout = 10 * time.Minute

func migrateDatabase(parent context.Context, migrator interface{ Migrate(context.Context) error }) error {
	ctx, cancel := context.WithTimeout(parent, migrationTimeout)
	defer cancel()
	started := time.Now()
	slog.Info("database migration started", "timeout", migrationTimeout)
	if err := migrator.Migrate(ctx); err != nil {
		return fmt.Errorf("database migration after %s: %w", time.Since(started).Round(time.Millisecond), err)
	}
	slog.Info("database migration completed", "elapsed", time.Since(started).Round(time.Millisecond))
	return nil
}
