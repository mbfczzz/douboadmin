package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"time"
)

func (m *MySQL) ExpiredActivationCodes(ctx context.Context, limit int) ([]core.Record, error) {
	if limit < 1 || limit > 200 {
		return nil, fmt.Errorf("invalid expiry batch")
	}
	rows, e := m.db.QueryContext(ctx, `SELECT id,owner_id,version,data,created_at FROM records WHERE namespace='activation_codes' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))='pending' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(data,'$.expiresUnix')) AS UNSIGNED)<=UNIX_TIMESTAMP() ORDER BY created_at LIMIT ?`, limit)
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
func (m *Memory) ExpiredActivationCodes(_ context.Context, limit int) ([]core.Record, error) {
	if limit < 1 || limit > 200 {
		return nil, fmt.Errorf("invalid expiry batch")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []core.Record{}
	for key, row := range m.records {
		if key != "activation_codes:"+row.ID {
			continue
		}
		var v core.ActivationCode
		if json.Unmarshal(row.Data, &v) == nil && v.Status == "pending" && v.ExpiresUnix <= time.Now().Unix() {
			out = append(out, copyRecord(row))
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}
