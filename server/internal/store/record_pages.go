package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"
)

// placeholders returns "NULL" for an empty list so `IN (NULL)` matches nothing.
func placeholders(n int) string {
	if n == 0 {
		return "NULL"
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}
func anyStrings(values []string) []any {
	out := make([]any, len(values))
	for i, v := range values {
		out[i] = v
	}
	return out
}

func validRecordPage(q core.RecordQuery) bool {
	return q.Namespace != "" && q.Page >= 1 && q.Page <= 1000000 && q.Size >= 1 && q.Size <= 100 && len([]rune(q.Search)) <= 100
}

// has reports whether a table stores a JSON field as a column.
func (t Table) has(field string) bool {
	for _, c := range t.Cols {
		if c.Field == field {
			return true
		}
	}
	return false
}

// searchable is the text a page search looks in: the id and every string column.
func (t Table) searchable() string {
	parts := []string{"id"}
	for _, c := range t.Cols {
		if c.Kind == Text || c.Kind == Short || c.Kind == Key {
			parts = append(parts, "`"+c.column()+"`")
		}
	}
	return "CONCAT_WS(' '," + strings.Join(parts, ",") + ")"
}

func (m *MySQL) RecordPage(ctx context.Context, q core.RecordQuery) (out core.RecordPage, err error) {
	out = core.RecordPage{Items: []core.Record{}, Page: q.Page, Size: q.Size}
	if !validRecordPage(q) {
		return out, fmt.Errorf("invalid record page")
	}
	t, err := tableOf(q.Namespace)
	if err != nil {
		return out, err
	}
	// A filter on a field the table lacks matches nothing, like the JSON
	// path it replaces.
	where, args := " FROM `"+t.Name+"` WHERE 1=1", []any{}
	field := func(name string) string {
		if !t.has(name) {
			return "NULL"
		}
		return "`" + column(name) + "`"
	} // has() matches object fields, whose column is column(field)
	if q.ByID && q.AfterID != "" {
		where += ` AND id>?`
		args = append(args, q.AfterID)
	}
	if q.Owner != "" {
		where += ` AND owner_id=?`
		args = append(args, q.Owner)
	}
	if q.PartnerID != "" {
		where += ` AND ` + field("partnerId") + `=?`
		args = append(args, q.PartnerID)
	}
	// A non-nil empty scope means the caller may see nothing.
	if q.OwnerIn != nil {
		where += ` AND owner_id IN (` + placeholders(len(q.OwnerIn)) + `)`
		args = append(args, anyStrings(q.OwnerIn)...)
	}
	if q.PartnerIn != nil {
		where += ` AND ` + field("partnerId") + ` IN (` + placeholders(len(q.PartnerIn)) + `)`
		args = append(args, anyStrings(q.PartnerIn)...)
	}
	if q.Search != "" {
		where += ` AND LOCATE(?,` + t.searchable() + `)>0`
		args = append(args, q.Search)
	}
	if q.Status != "" {
		where += ` AND ` + field("status") + `=?`
		args = append(args, q.Status)
	}
	extra, values, e := recordFilters(t, q)
	if e != nil {
		return out, e
	}
	where += extra
	args = append(args, values...)
	tx, e := m.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if e != nil {
		return out, e
	}
	defer tx.Rollback()
	if e = tx.QueryRowContext(ctx, `SELECT COUNT(*)`+where, args...).Scan(&out.Total); e != nil {
		return out, e
	}
	order := ` ORDER BY created_at DESC,id DESC`
	if q.ByID {
		order = ` ORDER BY id ASC`
	} else if q.SortField != "" {
		order = " ORDER BY COALESCE(`" + column(q.SortField) + "`,0) ASC,id DESC"
	}
	items, e := listRows(ctx, tx, "SELECT "+t.selectList()+where+order+` LIMIT ? OFFSET ?`, t, append(args, q.Size, (q.Page-1)*q.Size)...)
	if e != nil {
		return out, e
	}
	out.Items = items
	return out, tx.Commit()
}
func (m *Memory) RecordPage(_ context.Context, q core.RecordQuery) (out core.RecordPage, err error) {
	out = core.RecordPage{Items: []core.Record{}, Page: q.Page, Size: q.Size}
	if !validRecordPage(q) {
		return out, fmt.Errorf("invalid record page")
	}
	t, e := tableOf(q.Namespace)
	if e != nil {
		return out, e
	}
	if _, _, e = recordFilters(t, q); e != nil {
		return out, e
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	items := []core.Record{}
	for key, row := range m.records {
		if !recordMatches(t, row, q) {
			continue
		}
		if q.ByID && row.ID <= q.AfterID {
			continue
		}
		if key != q.Namespace+":"+row.ID || (q.Owner != "" && q.Owner != row.Owner) {
			continue
		}
		if q.OwnerIn != nil && !slices.Contains(q.OwnerIn, row.Owner) {
			continue
		}
		if !recordSearch(t, row, q.Search) {
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
		if q.PartnerID != "" || q.PartnerIn != nil {
			var v struct {
				PartnerID string `json:"partnerId"`
			}
			if json.Unmarshal(row.Data, &v) != nil || (q.PartnerID != "" && v.PartnerID != q.PartnerID) || (q.PartnerIn != nil && !slices.Contains(q.PartnerIn, v.PartnerID)) {
				continue
			}
		}
		items = append(items, copyRecord(row))
	}
	if q.ByID {
		sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	} else {
		sortNewest(items)
		if q.SortField != "" {
			sort.Slice(items, func(i, j int) bool {
				a, b := recordNumber(items[i], q.SortField), recordNumber(items[j], q.SortField)
				if a == b {
					return items[i].ID > items[j].ID
				}
				return a < b
			})
		}
	}
	out.Total = len(items)
	start := (q.Page - 1) * q.Size
	if start < len(items) {
		out.Items = items[start:min(start+q.Size, len(items))]
	}
	return
}

// sortNewest orders like MySQL's created_at DESC, id DESC.
func sortNewest(items []core.Record) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
}
