package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"sort"
)

func pendingStates(ns string) ([]string, error) {
	switch ns {
	case "orders":
		return []string{"created"}, nil
	case "refunds":
		return []string{"pending", "processing", "abnormal"}, nil
	default:
		return nil, fmt.Errorf("unsupported payment namespace")
	}
}

// Cursor pagination includes old unsettled records, independent of UI list limits.
func (m *MySQL) PendingPayments(ctx context.Context, ns, after string, limit int) ([]core.Record, error) {
	states, err := pendingStates(ns)
	if err != nil || limit < 1 || limit > 100 {
		return nil, fmt.Errorf("invalid pending payment query")
	}
	q := `SELECT id,owner_id,version,data,created_at FROM records WHERE namespace=? AND id>? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status')) IN (`
	args := []any{ns, after}
	for i, state := range states {
		if i > 0 {
			q += ","
		}
		q += "?"
		args = append(args, state)
	}
	q += `) ORDER BY id LIMIT ?`
	args = append(args, limit)
	rows, err := m.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Record{}
	for rows.Next() {
		var r core.Record
		if err = rows.Scan(&r.ID, &r.Owner, &r.Version, &r.Data, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (m *Memory) PendingPayments(_ context.Context, ns, after string, limit int) ([]core.Record, error) {
	states, err := pendingStates(ns)
	if err != nil || limit < 1 || limit > 100 {
		return nil, fmt.Errorf("invalid pending payment query")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []core.Record{}
	for key, r := range m.records {
		if key != ns+":"+r.ID || r.ID <= after {
			continue
		}
		var v struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(r.Data, &v) != nil {
			continue
		}
		for _, state := range states {
			if v.Status == state {
				out = append(out, copyRecord(r))
				break
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
