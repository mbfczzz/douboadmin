package store

import (
	"context"
	"doubo/server/internal/core"
	"time"
)

func (t *mysqlTransaction) ProgressJob(j core.Job, p int) error {
	return affected(t.tx.ExecContext(t.ctx, `UPDATE jobs SET progress=GREATEST(progress,?),updated_at=UTC_TIMESTAMP(6) WHERE id=? AND status='running' AND lease_token=? AND lease_until>UTC_TIMESTAMP(6)`, p, j.ID, j.LeaseToken))
}
func (t *memoryTransaction) ProgressJob(j core.Job, p int) error {
	old, ok := t.jobs[j.ID]
	if !ok || old.Status != "running" || old.LeaseToken != j.LeaseToken || !old.LeaseUntil.After(time.Now()) {
		return core.ErrConflict
	}
	if p > old.Progress {
		old.Progress = p
	}
	old.UpdatedAt = time.Now().UTC()
	t.jobs[j.ID] = old
	return nil
}
func progress(ctx context.Context, s Store, j core.Job, p int, stage string) error {
	if p < 0 || p > 99 || len([]rune(stage)) > 80 {
		return core.ErrConflict
	}
	return s.Atomic(ctx, func(tx Transaction) error {
		if e := tx.ProgressJob(j, p); e != nil {
			return e
		}
		row, e := tx.Lock("job_progress", core.Record{ID: j.ID, Owner: j.UserID, Data: core.Data(map[string]any{})})
		if e != nil {
			return e
		}
		row.Data = core.Data(map[string]any{"stage": stage})
		_, e = tx.Put("job_progress", row, row.Version)
		return e
	})
}
func (m *MySQL) Progress(ctx context.Context, j core.Job, p int, stage string) error {
	return progress(ctx, m, j, p, stage)
}
func (m *Memory) Progress(ctx context.Context, j core.Job, p int, stage string) error {
	return progress(ctx, m, j, p, stage)
}
