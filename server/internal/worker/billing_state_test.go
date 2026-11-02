package worker

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"doubo/server/internal/store"
	"errors"
	"testing"
)

type failingLookup struct{ store.Store }

func (s failingLookup) Get(context.Context, string, string) (core.Record, error) {
	return core.Record{}, errors.New("database unavailable")
}

func TestFailedChargeRequiresKnownFailureBeforeRelease(t *testing.T) {
	ctx := context.Background()
	cause := errors.New("generation interrupted")
	if !holdFailedCharge(ctx, failingLookup{}, "task", cause) {
		t.Fatal("database failure released funds")
	}
	for _, phase := range []string{"failed", "submitting", "uncertain", "polling", "output", "succeeded", ""} {
		s := store.NewMemory()
		_, _ = s.Put(ctx, "executions", core.Record{ID: "task", Data: core.Data(provider.Execution{Phase: phase})}, 0)
		if holdFailedCharge(ctx, s, "task", cause) != (phase != "failed") {
			t.Fatalf("wrong release decision for %s", phase)
		}
	}
	s := store.NewMemory()
	if holdFailedCharge(ctx, s, "task", cause) {
		t.Fatal("pre-submission rejection held funds")
	}
	if !holdFailedCharge(ctx, s, "task", provider.ErrUncertain) {
		t.Fatal("ambiguous submission lost its hold")
	}
	_, _ = s.Put(ctx, "executions", core.Record{ID: "task", Data: []byte(`{"phase":42}`)}, 0)
	if !holdFailedCharge(ctx, s, "task", cause) {
		t.Fatal("invalid record released funds")
	}
}
