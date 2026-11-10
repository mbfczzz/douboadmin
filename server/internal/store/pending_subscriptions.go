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
	t, e := tableOf("subscription_queue")
	if e != nil {
		return nil, e
	}
	return listRows(ctx, m.db, `SELECT `+t.selectAs("q")+` FROM subscription_queue q LEFT JOIN subscription_delivery d ON d.id=q.id WHERE q.id>? AND q.created_at>=UTC_TIMESTAMP(6)-INTERVAL 1 DAY AND d.id IS NULL ORDER BY q.id LIMIT ?`, t, after, limit)
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
