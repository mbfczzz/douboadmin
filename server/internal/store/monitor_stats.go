package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type errorCounter interface {
	CountErrorsSince(context.Context, time.Time) (int, error)
}

// CountErrorsSince counts folded ERROR rows, rather than loading historical
// logs into the API process every time the monitor polls.
func CountErrorsSince(ctx context.Context, s Store, since time.Time) (int, error) {
	if counter, ok := s.(errorCounter); ok {
		return counter.CountErrorsSince(ctx, since)
	}
	return 0, fmt.Errorf("store does not support monitor error statistics")
}

func (m *MySQL) CountErrorsSince(ctx context.Context, since time.Time) (int, error) {
	var count int
	err := m.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM error_logs WHERE level='ERROR' AND (last_at>? OR (last_at IS NULL AND created_at>?))`, since.UTC(), since.UTC()).Scan(&count)
	return count, err
}

func (m *Memory) CountErrorsSince(_ context.Context, since time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	count := 0
	for key, row := range m.records {
		if !strings.HasPrefix(key, "error_logs:") {
			continue
		}
		var event core.ErrorLog
		if err := json.Unmarshal(row.Data, &event); err != nil {
			return 0, err
		}
		at := event.LastAt
		if at.IsZero() {
			at = row.CreatedAt
		}
		if event.Level == "ERROR" && at.After(since) {
			count++
		}
	}
	return count, nil
}
