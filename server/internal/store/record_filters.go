package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"
)

func filterColumn(t Table, name string) (Col, error) {
	for _, col := range t.Cols {
		if col.Field == name {
			return col, nil
		}
	}
	return Col{}, fmt.Errorf("unsupported record filter")
}

func recordFilters(t Table, q core.RecordQuery) (string, []any, error) {
	where, args := "", []any{}
	if len(q.NotIDs) > 0 {
		where += " AND id NOT IN (" + placeholders(len(q.NotIDs)) + ")"
		args = append(args, anyStrings(q.NotIDs)...)
	}
	for field, values := range q.FieldsIn {
		col, e := filterColumn(t, field)
		if e != nil {
			return "", nil, e
		}
		name := "`" + col.column() + "`"
		if col.Kind == Bool {
			name = "COALESCE(" + name + ",0)"
		}
		where += " AND " + name + " IN (" + placeholders(len(values)) + ")"
		for _, value := range values {
			if col.Kind == Bool {
				flag, e := strconv.ParseBool(value)
				if e != nil {
					return "", nil, e
				}
				args = append(args, flag)
			} else {
				args = append(args, value)
			}
		}
	}
	if q.IDs != nil {
		where += " AND id IN (" + placeholders(len(q.IDs)) + ")"
		args = append(args, anyStrings(q.IDs)...)
	}
	for _, filter := range []struct {
		fields map[string]string
		op     string
	}{{q.Fields, "="}, {q.NotFields, "<>"}} {
		for name, value := range filter.fields {
			var col *Col
			for i := range t.Cols {
				if t.Cols[i].Field == name {
					col = &t.Cols[i]
					break
				}
			}
			if col == nil {
				return "", nil, fmt.Errorf("unsupported record filter")
			}
			fallback := "''"
			var v any = value
			if col.Kind == Bool {
				flag, e := strconv.ParseBool(value)
				if e != nil {
					return "", nil, e
				}
				v = flag
				fallback = "0"
			}
			where += " AND COALESCE(`" + col.column() + "`," + fallback + ")" + filter.op + "?"
			args = append(args, v)
		}
	}
	if q.SortField != "" {
		col, e := filterColumn(t, q.SortField)
		if e != nil || col.Kind != Int && col.Kind != Float {
			return "", nil, fmt.Errorf("unsupported record sort")
		}
	}
	return where, args, nil
}

func recordMatches(t Table, row core.Record, q core.RecordQuery) bool {
	if slices.Contains(q.NotIDs, row.ID) {
		return false
	}
	if q.IDs != nil && !slices.Contains(q.IDs, row.ID) {
		return false
	}
	var data map[string]any
	_ = json.Unmarshal(row.Data, &data)
	value := func(key string) string {
		if data[key] != nil {
			return fmt.Sprint(data[key])
		}
		col, _ := filterColumn(t, key)
		if col.Kind == Bool {
			return "false"
		}
		return ""
	}
	expected := func(key, v string) string {
		col, _ := filterColumn(t, key)
		if col.Kind == Bool {
			flag, _ := strconv.ParseBool(v)
			return strconv.FormatBool(flag)
		}
		return v
	}
	for key, values := range q.FieldsIn {
		found := false
		for _, v := range values {
			if value(key) == expected(key, v) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	for k, v := range q.Fields {
		if value(k) != expected(k, v) {
			return false
		}
	}
	for k, v := range q.NotFields {
		if value(k) == expected(k, v) {
			return false
		}
	}
	return true
}

func recordSearch(t Table, row core.Record, query string) bool {
	if query == "" {
		return true
	}
	var data map[string]any
	_ = json.Unmarshal(row.Data, &data)
	parts := []string{row.ID}
	for _, col := range t.Cols {
		if col.Kind == Text || col.Kind == Short || col.Kind == Key {
			if value, ok := data[col.Field].(string); ok {
				parts = append(parts, value)
			}
		}
	}
	return strings.Contains(strings.ToLower(strings.Join(parts, " ")), strings.ToLower(query))
}

func recordNumber(row core.Record, key string) float64 {
	var data map[string]any
	_ = json.Unmarshal(row.Data, &data)
	n, _ := data[key].(float64)
	return n
}

// AllRecords is for complete internal lookups, never a UI pagination substitute.
// Keyset traversal avoids the legacy List ceiling without enlarging each read.
func AllRecords(ctx context.Context, s Store, ns, owner string) ([]core.Record, error) {
	rows := []core.Record{}
	q := core.RecordQuery{Namespace: ns, Owner: owner, ByID: true, Page: 1, Size: 100}
	for {
		page, e := s.RecordPage(ctx, q)
		if e != nil {
			return nil, e
		}
		rows = append(rows, page.Items...)
		if len(page.Items) < q.Size {
			return rows, nil
		}
		q.AfterID = page.Items[len(page.Items)-1].ID
	}
}
