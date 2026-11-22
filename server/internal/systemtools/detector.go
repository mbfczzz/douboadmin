package systemtools

import (
	"context"
	"doubo/server/internal/core"
	"sync"
	"sync/atomic"
	"time"
)

type Detector struct {
	mu         sync.Mutex
	probe      func(context.Context, string) core.ToolCheck
	cached     core.MediaTools
	updated    time.Time
	generation atomic.Uint64
}

func New() *Detector { return &Detector{probe: probe} }

// Check caches heartbeat checks for 30 seconds. Explicit checks bypass that
// cache, but requests already waiting for the same probe share its result.
func (d *Detector) Check(ctx context.Context, force bool) (core.MediaTools, error) {
	requested := d.generation.Load()
	d.mu.Lock()
	defer d.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return core.MediaTools{}, err
	}
	if !d.updated.IsZero() && ((!force && time.Since(d.updated) < 30*time.Second) || d.generation.Load() != requested) {
		return d.cached, nil
	}
	var out core.MediaTools
	var group sync.WaitGroup
	group.Go(func() { out.FFmpeg = d.probe(ctx, "ffmpeg") })
	group.Go(func() { out.FFprobe = d.probe(ctx, "ffprobe") })
	group.Wait()
	// Aborting an HTTP request must not replace a healthy shared result with
	// an artificial process failure caused by that request's cancellation.
	if err := ctx.Err(); err != nil {
		return core.MediaTools{}, err
	}
	d.updated = time.Now()
	out.CheckedAt = d.updated.UTC()
	d.cached = out
	d.generation.Add(1)
	return out, nil
}

func (d *Detector) Latest() *core.MediaTools {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.updated.IsZero() {
		return nil
	}
	out := d.cached
	return &out
}
