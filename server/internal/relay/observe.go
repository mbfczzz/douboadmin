package relay

import (
	"context"
	"time"
)

// Call describes one upstream request for logging.
type Call struct {
	Method, Path string
	Body         any
	Status       int // 0 when no HTTP response arrived
	Response     []byte
	Err          error
	Took         time.Duration
}

// Job identifies whose generation an upstream call belongs to.
type Job struct{ ID, User, Model, Kind string }

type jobKey struct{}

func WithJob(ctx context.Context, j Job) context.Context {
	return context.WithValue(ctx, jobKey{}, j)
}

func JobFrom(ctx context.Context) (Job, bool) {
	j, ok := ctx.Value(jobKey{}).(Job)
	return j, ok
}
