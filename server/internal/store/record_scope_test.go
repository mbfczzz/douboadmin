package store

import (
	"context"
	"doubo/server/internal/core"
	"testing"
)

// Provider subtrees filter lists by owner or data.partnerId; an empty
// non-nil scope must return nothing on both drivers.
func TestRecordPageScopes(t *testing.T) {
	run := func(t *testing.T, s Store) {
		ctx := context.Background()
		for _, r := range []struct{ id, owner, partner string }{{"c1", "p1", "p1"}, {"c2", "p2", "p2"}, {"c3", "p3", "p1"}} {
			if _, err := s.Put(ctx, "scope_records", core.Record{ID: r.id, Owner: r.owner, Data: core.Data(map[string]string{"partnerId": r.partner})}, 0); err != nil {
				t.Fatal(err)
			}
		}
		count := func(q core.RecordQuery) int {
			q.Namespace, q.Page, q.Size = "scope_records", 1, 20
			page, err := s.RecordPage(ctx, q)
			if err != nil {
				t.Fatal(err)
			}
			return page.Total
		}
		if n := count(core.RecordQuery{OwnerIn: []string{"p1", "p3"}}); n != 2 {
			t.Fatal("owner scope", n)
		}
		if n := count(core.RecordQuery{PartnerIn: []string{"p1"}}); n != 2 {
			t.Fatal("partner scope", n)
		}
		if n := count(core.RecordQuery{OwnerIn: []string{}}); n != 0 {
			t.Fatal("empty scope leaked rows", n)
		}
		if n := count(core.RecordQuery{}); n != 3 {
			t.Fatal("unscoped", n)
		}
	}
	t.Run("memory", func(t *testing.T) { run(t, NewMemory()) })
	t.Run("mysql", func(t *testing.T) {
		m := mysqlFixture(t)
		_, _ = m.db.Exec(`DELETE FROM scope_records`)
		run(t, m)
	})
}
