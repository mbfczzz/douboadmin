package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type migrationFunc func(context.Context) error

func (f migrationFunc) Migrate(ctx context.Context) error { return f(ctx) }

func TestMigrationUsesIndependentBudgetAndCancelsOnReturn(t *testing.T) {
	parent := context.Background()
	check, cancelCheck := context.WithTimeout(parent, 10*time.Second)
	cancelCheck() // The completed connectivity probe must not govern migration.
	if check.Err() == nil {
		t.Fatal("probe should be finished")
	}
	var migrationContext context.Context
	err := migrateDatabase(parent, migrationFunc(func(ctx context.Context) error {
		migrationContext = ctx
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) < 9*time.Minute || time.Until(deadline) > 10*time.Minute {
			t.Fatal("migration inherited short connectivity timeout")
		}
		return ctx.Err()
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !errors.Is(migrationContext.Err(), context.Canceled) {
		t.Fatal("migration timer not released")
	}
}

func TestMigrationHonorsParentCancellationAndPreservesFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := migrateDatabase(ctx, migrationFunc(func(ctx context.Context) error { return ctx.Err() }))
	if !errors.Is(err, context.Canceled) || !strings.Contains(err.Error(), "database migration") {
		t.Fatal(err)
	}
	cause := errors.New("fixture schema failure")
	err = migrateDatabase(context.Background(), migrationFunc(func(context.Context) error { return cause }))
	if !errors.Is(err, cause) {
		t.Fatal(err)
	}
}
