package store

import (
	"context"
	"doubo/server/internal/core"
	"time"
)

// Hold extends ownership before a bounded upstream call; release schedules the next poll.
func (m *Memory) Hold(_ context.Context, j core.Job, seconds int, release bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	old, ok := m.jobs[j.ID]
	if !ok || old.Status != "running" || old.LeaseToken != j.LeaseToken || !old.LeaseUntil.After(time.Now()) {
		return core.ErrConflict
	}
	old.LeaseUntil = time.Now().UTC().Add(time.Duration(seconds) * time.Second)
	old.UpdatedAt = time.Now().UTC()
	if release {
		old.LeaseToken = ""
	}
	m.jobs[j.ID] = old
	return nil
}

func (m *MySQL) Hold(ctx context.Context, j core.Job, seconds int, release bool) error {
	token := j.LeaseToken
	if release {
		token = ""
	}
	res, err := m.db.ExecContext(ctx, `UPDATE jobs SET lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),lease_token=?,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND status='running' AND lease_token=? AND lease_until>UTC_TIMESTAMP(6)`, seconds, token, j.ID, j.LeaseToken)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return core.ErrConflict
	}
	return nil
}
