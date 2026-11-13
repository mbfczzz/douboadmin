package store

import (
	"context"
	"doubo/server/internal/core"
)

// Every financial update locks the user's wallet before other mutable records/jobs.
type Transaction interface {
	Records(string) ([]core.Record, error)
	HasRecords(string) (bool, error)
	Get(string, string) (core.Record, error)
	// Empty Data locks an existing record only; a provided initializer creates it if missing.
	Lock(string, core.Record) (core.Record, error)
	Put(string, core.Record, int64) (core.Record, error)
	Job(string) (core.Job, error)
	InsertJob(core.Job) error
	CompleteJob(core.Job, string, string) error
	ResumeJob(string) error
	ProgressJob(core.Job, int) error
}

type AtomicStore interface {
	Atomic(context.Context, func(Transaction) error) error
}
