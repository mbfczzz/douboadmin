package store

import (
	"context"
	"doubo/server/internal/core"
	"os"
	"strings"
	"testing"
	"time"
)

func TestActivityReferencesKeepIndexedIDsUnchanged(t *testing.T) {
	refs := map[string]string{}
	for table, collation := range map[string]string{"admin_accounts": "utf8mb4_general_ci", "partner_owners": "utf8mb4_0900_ai_ci", "memberships": "utf8mb4_bin"} {
		value, e := actorIDExpression("utf8mb4", collation)
		if e != nil {
			t.Fatal(e)
		}
		refs[table] = value
	}
	where, args := activityLogWhere(core.AuditQuery{PartnerID: "child"}, refs)
	if len(args) != 3 {
		t.Fatal(args)
	}
	for _, expression := range refs {
		if !strings.Contains(where, ".id="+expression) {
			t.Fatal(where)
		}
	}
	for _, alias := range []string{"a", "p", "m"} {
		if strings.Contains(where, "CONVERT("+alias+".id") {
			t.Fatal("index wrapped", where)
		}
	}
	for _, pair := range [][2]string{{"utf8mb4;DROP TABLE users", "utf8mb4_bin"}, {"utf8mb4", "x OR 1=1"}, {"", ""}} {
		if _, e := actorIDExpression(pair[0], pair[1]); e == nil {
			t.Fatal("unsafe metadata accepted")
		}
	}
}

// Existing-schema SELECT-only probe. Never prints or changes business data.
func TestMySQLReadOnlyActivityQueries(t *testing.T) {
	dsn := os.Getenv("MYSQL_READONLY_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_READONLY_TEST_DSN enables existing-schema checks")
	}
	m, e := NewMySQL(dsn)
	if e != nil {
		t.Fatal("invalid test configuration")
	}
	defer m.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	for _, members := range []bool{false, true} {
		query := core.AuditQuery{PartnerID: "readonly-activity-probe", MembersOnly: members, Categories: []string{core.LogBusiness, core.LogAuth, core.LogAPI}, Limit: 1}
		if _, e = m.Logs(ctx, query); e != nil {
			t.Fatal(e)
		}
		query.Before = "99999999999999999999999999"
		if _, e = m.Logs(ctx, query); e != nil {
			t.Fatal("pagination", e)
		}
	}
	// Exercise scanLog against existing rows too; an empty-scope probe only
	// verifies that MySQL can parse the joins.
	partners, e := m.RecordPage(ctx, core.RecordQuery{Namespace: "partners", Page: 1, Size: 3})
	if e != nil {
		t.Fatal(e)
	}
	for _, partner := range partners.Items {
		for _, members := range []bool{false, true} {
			if _, e = m.Logs(ctx, core.AuditQuery{PartnerID: partner.ID, MembersOnly: members, Limit: 2}); e != nil {
				t.Fatal("existing activity rows", e)
			}
		}
	}
	refs, e := m.activityComparisons(ctx, core.AuditQuery{PartnerID: "readonly-activity-probe"})
	if e != nil {
		t.Fatal(e)
	}
	for table, expression := range refs {
		var plan string
		if e = m.db.QueryRowContext(ctx, "EXPLAIN FORMAT=JSON SELECT audit_logs.id,r.id FROM audit_logs LEFT JOIN `"+table+"` r ON r.id="+expression+" LIMIT 1").Scan(&plan); e != nil {
			t.Fatal(e)
		}
		if !strings.Contains(plan, `"key": "PRIMARY"`) {
			t.Fatalf("%s lost primary-key lookup", table)
		}
	}
}
