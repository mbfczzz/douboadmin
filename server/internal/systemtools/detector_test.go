package systemtools

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
)

func TestDetectorCachesConcurrentChecksAndAllowsExplicitRefresh(t *testing.T) {
	d := New()
	var calls atomic.Int32
	d.probe = func(_ context.Context, name string) core.ToolCheck {
		calls.Add(1)
		return core.ToolCheck{Status: "ready", Version: name + "-fixture"}
	}
	if d.Latest() != nil {
		t.Fatal("unchecked detector has a result")
	}
	var group sync.WaitGroup
	for range 20 {
		group.Go(func() {
			out, err := d.Check(t.Context(), false)
			if err != nil || out.FFmpeg.Version != "ffmpeg-fixture" || out.FFprobe.Version != "ffprobe-fixture" || out.CheckedAt.IsZero() {
				t.Error(out, err)
			}
		})
	}
	group.Wait()
	if calls.Load() != 2 {
		t.Fatal("concurrent checks launched duplicate processes", calls.Load())
	}
	copy := d.Latest()
	copy.FFmpeg.Status = "failed"
	if d.Latest().FFmpeg.Status != "ready" {
		t.Fatal("caller modified the cached result")
	}
	if _, err := d.Check(t.Context(), true); err != nil || calls.Load() != 4 {
		t.Fatal("explicit refresh did not recheck", calls.Load(), err)
	}
}

func TestCanceledDetectorCheckDoesNotCacheArtificialFailures(t *testing.T) {
	d := New()
	ctx, cancel := context.WithCancel(t.Context())
	started := make(chan struct{}, 2)
	d.probe = func(ctx context.Context, _ string) core.ToolCheck {
		started <- struct{}{}
		<-ctx.Done()
		return core.ToolCheck{Status: "failed"}
	}
	done := make(chan error, 1)
	go func() { _, err := d.Check(ctx, true); done <- err }()
	<-started
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) || d.Latest() != nil {
		t.Fatal("canceled request poisoned shared diagnostics", err)
	}
}
