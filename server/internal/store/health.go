package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"time"
)

func (m *MySQL) QueueHealth(ctx context.Context) (out core.QueueHealth, err error) {
	var oldest sql.NullTime
	err = m.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(status='queued'),0),COALESCE(SUM(status='running'),0),COALESCE(SUM(status='failed' AND updated_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 HOUR)),0),MIN(CASE WHEN status='queued' THEN created_at END) FROM jobs`).Scan(&out.Queued, &out.Running, &out.FailedHour, &oldest)
	if oldest.Valid {
		out.OldestQueued = &oldest.Time
	}
	return
}
func (m *Memory) QueueHealth(context.Context) (core.QueueHealth, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out core.QueueHealth
	for _, j := range m.jobs {
		switch j.Status {
		case "queued":
			out.Queued++
			if out.OldestQueued == nil || j.CreatedAt.Before(*out.OldestQueued) {
				stamp := j.CreatedAt
				out.OldestQueued = &stamp
			}
		case "running":
			out.Running++
		case "failed":
			if time.Since(j.UpdatedAt) < time.Hour {
				out.FailedHour++
			}
		}
	}
	return out, nil
}
func (m *MySQL) PoolInfo() (int, int) { s := m.db.Stats(); return s.OpenConnections, s.InUse }
