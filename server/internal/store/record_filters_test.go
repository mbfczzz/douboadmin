package store

import (
	"doubo/server/internal/core"
	"testing"
	"time"
)

func TestRecordPageFilterValidationMatchesDatabase(t *testing.T) {
	s := NewMemory()
	for _, q := range []core.RecordQuery{
		{Namespace: "missing"},
		{Namespace: "admin_accounts", Fields: map[string]string{"missing": "value"}},
		{Namespace: "admin_accounts", FieldsIn: map[string][]string{"archived": {"invalid"}}},
		{Namespace: "admin_accounts", Fields: map[string]string{"archived": "invalid"}},
		{Namespace: "admin_accounts", SortField: "username"},
	} {
		q.Page, q.Size = 1, 20
		if _, e := s.RecordPage(t.Context(), q); e == nil {
			t.Fatalf("invalid filter accepted: %+v", q)
		}
	}
}

func TestRecordPageBooleanDefaultsAndExclusions(t *testing.T) {
	s := NewMemory()
	for _, row := range []core.Record{
		{ID: "omitted", Data: core.Data(map[string]any{"username": "omitted"})},
		{ID: "false", Data: core.Data(map[string]any{"username": "false", "archived": false})},
		{ID: "true", Data: core.Data(map[string]any{"username": "true", "archived": true})},
	} {
		if _, e := s.Put(t.Context(), "admin_accounts", row, 0); e != nil {
			t.Fatal(e)
		}
	}
	for _, q := range []core.RecordQuery{
		{Fields: map[string]string{"archived": "0"}},
		{FieldsIn: map[string][]string{"archived": {"false"}}},
		{NotFields: map[string]string{"archived": "1"}},
	} {
		q.Namespace, q.Page, q.Size = "admin_accounts", 1, 20
		page, e := s.RecordPage(t.Context(), q)
		if e != nil || page.Total != 2 {
			t.Fatal(page, e)
		}
	}
	page, e := s.RecordPage(t.Context(), core.RecordQuery{Namespace: "admin_accounts", Page: 1, Size: 20, NotIDs: []string{"omitted", "false"}})
	if e != nil || page.Total != 1 || page.Items[0].ID != "true" {
		t.Fatal(page, e)
	}
}

func TestRecordSortTieUsesIDAndSearchExcludesJSON(t *testing.T) {
	s := NewMemory()
	for _, id := range []string{"z", "a"} {
		if _, e := s.Put(t.Context(), "templates", core.Record{ID: id, Data: core.Data(core.Template{Title: id, Sort: 1})}, 0); e != nil {
			t.Fatal(e)
		}
	}
	// Deliberately oppose created-at order to verify SQL's sort,id tie rule.
	s.mu.Lock()
	a := s.records["templates:a"]
	a.CreatedAt = time.Now().Add(time.Hour)
	s.records["templates:a"] = a
	s.mu.Unlock()
	page, e := s.RecordPage(t.Context(), core.RecordQuery{Namespace: "templates", Page: 1, Size: 1, SortField: "sort"})
	if e != nil || page.Items[0].ID != "z" {
		t.Fatal(page, e)
	}
	if _, e = s.Put(t.Context(), "partners", core.Record{ID: "child", Data: core.Data(core.Partner{Name: "Child", Path: []string{"hidden-ancestor"}})}, 0); e != nil {
		t.Fatal(e)
	}
	page, e = s.RecordPage(t.Context(), core.RecordQuery{Namespace: "partners", Page: 1, Size: 20, Search: "hidden-ancestor"})
	if e != nil || page.Total != 0 {
		t.Fatal("JSON field unexpectedly searchable", page, e)
	}
}
