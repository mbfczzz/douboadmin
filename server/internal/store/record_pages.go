package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

func validRecordPage(q core.RecordQuery) bool {
	return q.Namespace != "" && q.Page >= 1 && q.Page <= 1000000 && q.Size >= 1 && q.Size <= 100 && len([]rune(q.Search)) <= 100
}
func (m *MySQL) RecordPage(ctx context.Context, q core.RecordQuery) (out core.RecordPage, err error) {
	out = core.RecordPage{Items: []core.Record{}, Page: q.Page, Size: q.Size}
	if !validRecordPage(q) {
		return out, fmt.Errorf("invalid record page")
	}
	where := ` FROM records WHERE namespace=?`
	args := []any{q.Namespace}
	if q.Owner != "" {
		where += ` AND owner_id=?`
		args = append(args, q.Owner)
	}
	if q.PartnerID != "" {
		where += ` AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.partnerId'))=?`
		args = append(args, q.PartnerID)
	}
	if q.Search != "" {
		where += ` AND (LOCATE(?,id)>0 OR LOCATE(?,CAST(data AS CHAR))>0)`
		args = append(args, q.Search, q.Search)
	}
	if q.Status != "" {
		where += ` AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))=?`
		args = append(args, q.Status)
	}
	tx, e := m.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if e != nil {
		return out, e
	}
	defer tx.Rollback()
	if e = tx.QueryRowContext(ctx, `SELECT COUNT(*)`+where, args...).Scan(&out.Total); e != nil {
		return out, e
	}
	rows, e := tx.QueryContext(ctx, `SELECT id,owner_id,version,data,created_at`+where+` ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, append(args, q.Size, (q.Page-1)*q.Size)...)
	if e != nil {
		return out, e
	}
	for rows.Next() {
		var row core.Record
		if e = rows.Scan(&row.ID, &row.Owner, &row.Version, &row.Data, &row.CreatedAt); e != nil {
			rows.Close()
			return out, e
		}
		out.Items = append(out.Items, row)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return out, e
	}
	return out, tx.Commit()
}
func (m *Memory) RecordPage(_ context.Context, q core.RecordQuery) (out core.RecordPage, err error) {
	out = core.RecordPage{Items: []core.Record{}, Page: q.Page, Size: q.Size}
	if !validRecordPage(q) {
		return out, fmt.Errorf("invalid record page")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	items := []core.Record{}
	for key, row := range m.records {
		if key != q.Namespace+":"+row.ID || (q.Owner != "" && q.Owner != row.Owner) {
			continue
		}
		if q.Search != "" && !strings.Contains(strings.ToLower(row.ID+string(row.Data)), strings.ToLower(q.Search)) {
			continue
		}
		if q.Status != "" {
			var status struct {
				Status string `json:"status"`
			}
			if json.Unmarshal(row.Data, &status) != nil || status.Status != q.Status {
				continue
			}
		}
		if q.PartnerID != "" {
			var v struct {
				PartnerID string `json:"partnerId"`
			}
			if json.Unmarshal(row.Data, &v) != nil || v.PartnerID != q.PartnerID {
				continue
			}
		}
		items = append(items, copyRecord(row))
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	out.Total = len(items)
	start := (q.Page - 1) * q.Size
	if start < len(items) {
		out.Items = items[start:min(start+q.Size, len(items))]
	}
	return
}
