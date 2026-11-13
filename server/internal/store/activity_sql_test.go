package store

import (
	"doubo/server/internal/core"
	"os"
	"reflect"
	"testing"
)

// Only connection-local temporary tables. Collations intentionally differ,
// reproducing the mixed historical schemas that broke the production query.
func TestMySQLActivityMixedCollationsAndScope(t *testing.T) {
	dsn := os.Getenv("MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEST_DSN enables temporary-table SQL regression")
	}
	m, e := NewMySQL(dsn)
	if e != nil {
		t.Fatal("invalid test configuration")
	}
	defer m.Close()
	conn, e := m.db.Conn(t.Context())
	if e != nil {
		t.Fatal(e)
	}
	defer conn.Close()
	queries := []string{
		`CREATE TEMPORARY TABLE audit_logs(id VARCHAR(26) PRIMARY KEY,actor_type VARCHAR(16),actor_id VARCHAR(64),category VARCHAR(16)) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
		`CREATE TEMPORARY TABLE admin_accounts(id VARCHAR(64) PRIMARY KEY,partner_id VARCHAR(64)) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
		`CREATE TEMPORARY TABLE partner_owners(id VARCHAR(64) PRIMARY KEY,partner_id VARCHAR(64),status VARCHAR(16)) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
		`CREATE TEMPORARY TABLE memberships(id VARCHAR(64) PRIMARY KEY,partner_id VARCHAR(64),status VARCHAR(16)) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
		`INSERT INTO admin_accounts VALUES ('admin-child','child'),('admin-other','other')`,
		`INSERT INTO partner_owners VALUES ('owner-child','child','active')`,
		`INSERT INTO memberships VALUES ('member-child','child','active'),('member-unbound','child','unbound'),('member-other','other','active')`,
		`INSERT INTO audit_logs VALUES ('01','provider','admin-child','business'),('02','user','owner-child','auth'),('03','user','member-child','api'),('04','admin','admin-other','business'),('05','user','member-unbound','auth'),('06','user','member-other','api')`,
	}
	for _, q := range queries {
		if _, e = conn.ExecContext(t.Context(), q); e != nil {
			t.Fatal(e)
		}
	}
	refs := map[string]string{}
	for table, collation := range map[string]string{"admin_accounts": "utf8mb4_0900_ai_ci", "partner_owners": "utf8mb4_bin", "memberships": "utf8mb4_0900_ai_ci"} {
		refs[table], _ = actorIDExpression("utf8mb4", collation)
	}
	for _, tc := range []struct {
		members bool
		before  string
		want    []string
	}{
		{false, "", []string{"03", "02", "01"}},
		{true, "", []string{"03"}},
		{false, "03", []string{"02", "01"}},
		{true, "03", []string{}},
	} {
		where, args := activityLogWhere(core.AuditQuery{PartnerID: "child", MembersOnly: tc.members, Before: tc.before, Categories: []string{"business", "auth", "api"}}, refs)
		rows, e := conn.QueryContext(t.Context(), "SELECT id FROM audit_logs"+where+" ORDER BY id DESC", args...)
		if e != nil {
			t.Fatal(e)
		}
		got := []string{}
		for rows.Next() {
			var id string
			if e = rows.Scan(&id); e != nil {
				t.Fatal(e)
			}
			got = append(got, id)
		}
		e = rows.Err()
		rows.Close()
		if e != nil || !reflect.DeepEqual(got, tc.want) {
			t.Fatal("scope/pagination", got, tc.want, e)
		}
	}
}
