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
	t, err := tableOf(ns)
	if err != nil {
		return nil, err
	}
	q := "SELECT " + t.selectList() + " FROM `" + t.Name + "` WHERE id>? AND status IN (" + placeholders(len(states)) + ") ORDER BY id LIMIT ?"
	return listRows(ctx, m.db, q, t, append(append([]any{after}, anyStrings(states)...), limit)...)
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
