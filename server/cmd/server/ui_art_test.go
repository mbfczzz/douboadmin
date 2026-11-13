package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"doubo/server/internal/settings"
)

type artSyncFunc func(context.Context) (int, error)

func (f artSyncFunc) Sync(ctx context.Context) (int, error) { return f(ctx) }

func TestUIArtSyncSkipsUnconfiguredButRejectsPartialSettings(t *testing.T) {
	if err := syncUIArt(t.Context(), t.TempDir(), settings.Values{"OSS_REGION": "cn-hangzhou"}); err != nil {
		t.Fatal("unconfigured install should retain local images", err)
	}
	for _, values := range []settings.Values{
		{"OSS_BUCKET": "test"},
		{"OSS_REGION": "cn-hangzhou", "OSS_BUCKET": "test", "OSS_ACCESS_KEY_ID": "fixture"},
		{"OSS_ACCESS_KEY_SECRET": "fixture-secret"},
	} {
		if err := syncUIArt(t.Context(), t.TempDir(), values); err == nil {
			t.Fatal("partial configuration silently skipped upload")
		}
	}
}

func TestUIArtDeploymentBudgetAndSecretSafeFailure(t *testing.T) {
	var used context.Context
	err := uploadUIArt(t.Context(), artSyncFunc(func(ctx context.Context) (int, error) {
		used = ctx
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) < 4*time.Minute || time.Until(deadline) > uiArtSyncTimeout {
			t.Fatal("incorrect deployment sync deadline")
		}
		return 15, nil
	}))
	if err != nil || !errors.Is(used.Err(), context.Canceled) {
		t.Fatal("successful synchronization failed or leaked timer", err)
	}
	err = uploadUIArt(t.Context(), artSyncFunc(func(context.Context) (int, error) {
		return 3, errors.New("https://private.test/?signature=secret-fixture")
	}))
	if err == nil || !strings.Contains(err.Error(), "after 3 images") || strings.Contains(err.Error(), "secret-fixture") {
		t.Fatal("failed sync was ignored or exposed signing credentials", err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	err = uploadUIArt(ctx, artSyncFunc(func(ctx context.Context) (int, error) { return 0, ctx.Err() }))
	if err == nil {
		t.Fatal("cancelled deployment continued")
	}
}
