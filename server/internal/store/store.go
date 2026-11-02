package store

import (
	"context"
	"doubo/server/internal/core"
)

// Versions protect admin writes; lease tokens fence obsolete workers after recovery.
type Store interface {
	AtomicStore
	Get(context.Context, string, string) (core.Record, error)
	List(context.Context, string, string) ([]core.Record, error)
	RecordPage(context.Context, core.RecordQuery) (core.RecordPage, error)
	ExpiredActivationCodes(context.Context, int) ([]core.Record, error)
	PendingPayments(context.Context, string, string, int) ([]core.Record, error)
	PaymentRecords(context.Context, core.PaymentQuery) (core.PaymentPage, error)
	PendingSubscriptions(context.Context, string, int) ([]core.Record, error)
	Put(context.Context, string, core.Record, int64) (core.Record, error)
	CreateJob(context.Context, core.Job) (core.Job, error)
	Jobs(context.Context, string) ([]core.Job, error)
	Job(context.Context, string) (core.Job, error)
	Claim(context.Context) (core.Job, error)
	Hold(context.Context, core.Job, int, bool) error
	Progress(context.Context, core.Job, int, string) error
	Finish(context.Context, core.Job, string, string) error
	Resume(context.Context, string) error
	Dashboard(context.Context, int) (core.Dashboard, error)
	QueueHealth(context.Context) (core.QueueHealth, error)
	Ping(context.Context) error
	Close() error
}
