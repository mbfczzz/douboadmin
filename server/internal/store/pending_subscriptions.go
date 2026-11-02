package store

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
	"sort"
	"time"
)

// Pending deliveries are independent from the bounded user-facing notification list.
func (m *MySQL) PendingSubscriptions(ctx context.Context, after string, limit int) ([]core.Record, error) {
	if limit < 1 || limit > 100 {
		return nil, fmt.Errorf("invalid subscription batch size")
	}
	rows, e := m.db.QueryContext(ctx, `SELECT q.id,q.owner_id,q.version,q.data,q.created_at FROM records q LEFT JOIN records d ON d.namespace='subscription_delivery' AND d.id=q.id WHERE q.namespace='subscription_queue' AND q.id>? AND q.created_at>=UTC_TIMESTAMP(6)-INTERVAL 1 DAY AND d.id IS NULL ORDER BY q.id LIMIT ?`, after, limit)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []core.Record{}
	for rows.Next() {
		var r core.Record
		if e = rows.Scan(&r.ID, &r.Owner, &r.Version, &r.Data, &r.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (m *Memory) PendingSubscriptions(_ context.Context, after string, limit int) ([]core.Record, error) {
	if limit < 1 || limit > 100 {
		return nil, fmt.Errorf("invalid subscription batch size")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []core.Record{}
	since := time.Now().Add(-24 * time.Hour)
	for key, r := range m.records {
		if key != "subscription_queue:"+r.ID || r.ID <= after || r.CreatedAt.Before(since) {
			continue
		}
		if _, delivered := m.records["subscription_delivery:"+r.ID]; !delivered {
			out = append(out, copyRecord(r))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
