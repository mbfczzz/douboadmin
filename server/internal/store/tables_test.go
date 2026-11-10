package store

import (
	"slices"
	"strings"
	"testing"
)

// Namespaces used only by this package's contract tests.
func init() {
	register(
		Table{Name: "test", Comment: "测试", Cols: []Col{c("title", Short)}},
		Table{Name: "lock_contract", Comment: "测试", Owner: "测试", Cols: []Col{
			c("status", Key), c("amountFen", Int), c("pointsUnits", Int),
		}},
		Table{Name: "scope_records", Comment: "测试", Owner: "测试", Cols: []Col{c("partnerId", Key)}},
	)
}

func TestTablesAreWellFormed(t *testing.T) {
	for _, tb := range Tables() {
		if tb.Comment == "" {
			t.Errorf("%s has no comment", tb.Name)
		}
		seen := []string{"id", "owner_id", "version", "created_at", "updated_at"}
		for _, col := range tb.Cols {
			name := col.column()
			if slices.Contains(seen, name) {
				t.Errorf("%s: column %s declared twice or shadows bookkeeping", tb.Name, name)
			}
			seen = append(seen, name)
		}
		for _, ix := range tb.Indexes {
			for _, name := range strings.Split(ix, ",") {
				if !slices.Contains(seen, name) {
					t.Errorf("%s: index on unknown column %s", tb.Name, name)
				}
			}
		}
		if ddl := tb.DDL(); !strings.Contains(ddl, "PRIMARY KEY (id)") {
			t.Errorf("%s: bad DDL %s", tb.Name, ddl)
		}
	}
}

func TestNormalizeMatchesWhatMySQLReturns(t *testing.T) {
	tb := Table{Name: "t", Cols: []Col{c("at", Time), c("n", Int), c("f", Float), c("on", Bool), c("tags", JSON), c("s", Short)}}
	got, err := tb.normalize([]byte(`{"at":"2026-01-02T03:04:05.123456789+08:00","n":7,"f":1.5,"on":false,"tags":["a"],"s":""}`))
	want := `{"at":"2026-01-01T19:04:05.123456Z","f":1.5,"n":7,"on":false,"s":"","tags":["a"]}`
	if err != nil || string(got) != want {
		t.Fatalf("got %s %v", got, err)
	}
	if got, _ = tb.normalize([]byte(`{"at":"0001-01-01T00:00:00Z","n":null}`)); string(got) != `{}` {
		t.Fatalf("zero time and null should read back absent: %s", got)
	}
	for _, bad := range []string{`{"other":1}`, `{"n":1.5}`, `{"on":"yes"}`, `[1]`} {
		if _, err = tb.normalize([]byte(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
	scalar := Table{Name: "s", Cols: []Col{{Kind: Key, Name: "order_id"}}}
	if got, err = scalar.normalize([]byte(`"order-1"`)); err != nil || string(got) != `"order-1"` {
		t.Fatalf("scalar: %s %v", got, err)
	}
}

// deleteOwned removes a test owner's rows from the given tables.
func deleteOwned(s *MySQL, owner string, tables ...string) {
	for _, name := range tables {
		_, _ = s.db.Exec("DELETE FROM `"+name+"` WHERE owner_id=?", owner)
	}
}

// A column declared after its table exists is added by Migrate.
func TestMySQLMigrateAddsNewColumns(t *testing.T) {
	s := mysqlFixture(t)
	if _, err := s.db.Exec("ALTER TABLE scope_records DROP COLUMN partner_id"); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='scope_records' AND COLUMN_NAME='partner_id'`).Scan(&n); err != nil || n != 1 {
		t.Fatal("column not restored", n, err)
	}
}
