package store

import (
	"context"
	"doubo/server/internal/core"
	"os"
	"strings"
	"testing"
	"time"
)

func TestJobReferenceUsesTargetCollationWithoutWrappingItsIndex(t *testing.T) {
	for _, collation := range []string{"utf8mb4_general_ci", "utf8mb4_0900_ai_ci", "utf8mb4_bin"} {
		expression, err := jobIDExpression("utf8mb4", collation)
		if err != nil {
			t.Fatal(err)
		}
		where, _ := jobWhere(core.JobQuery{Works: true, Deleted: "active"}, expression)
		if !strings.Contains(where, "w.id=CONVERT(j.id USING utf8mb4) COLLATE "+collation) {
			t.Fatal(where)
		}
		if strings.Contains(where, "CONVERT(w.id") || strings.Contains(where, "w.id=j.id") {
			t.Fatal("reference index conversion or mixed-collation comparison", where)
		}
	}
	for _, pair := range [][2]string{{"utf8mb4;DROP TABLE jobs", "utf8mb4_bin"}, {"utf8mb4", "utf8mb4_bin OR 1=1"}, {"", ""}} {
		if _, err := jobIDExpression(pair[0], pair[1]); err == nil {
			t.Fatal("unsafe metadata accepted")
		}
	}
}

// Opt-in regression against existing data: deliberately only SELECT/EXPLAIN,
// no migration, schema changes, inserts, updates or deletes.
func TestMySQLReadOnlyJobQueries(t *testing.T) {
	dsn := os.Getenv("MYSQL_READONLY_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_READONLY_TEST_DSN enables existing-schema read-only checks")
	}
	s, err := NewMySQL(dsn)
	if err != nil {
		t.Fatal("invalid read-only test configuration")
	}
	defer s.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	if err = s.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	for _, works := range []bool{false, true} {
		if _, err = s.JobPage(ctx, core.JobQuery{Page: 1, Size: 1, Works: works}); err != nil {
			t.Fatalf("works=%t: %v", works, err)
		}
	}
	// A non-existent owner still makes MySQL resolve and validate both joins.
	if _, err = s.JobStats(ctx, "readonly-regression-probe"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.JobModels(ctx, "readonly-regression-probe"); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"work_meta", "job_billing"} {
		expression, e := s.jobReferenceID(ctx, table)
		if e != nil {
			t.Fatal(e)
		}
		var plan string
		if e = s.db.QueryRowContext(ctx, "EXPLAIN FORMAT=JSON SELECT j.id,r.id FROM jobs j LEFT JOIN `"+table+"` r ON r.id="+expression+" LIMIT 1").Scan(&plan); e != nil {
			t.Fatal(e)
		}
		if !strings.Contains(plan, "PRIMARY") {
			t.Fatalf("reference primary key unavailable: %s", plan)
		}
	}
}
