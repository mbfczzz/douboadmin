package store

import (
	"os"
	"testing"
)

// This test uses one pinned connection and ONLY connection-local temporary
// tables. It does not call Migrate or modify any persistent business tables.
func TestMySQLPhoneBackfillSQL(t *testing.T) {
	dsn := os.Getenv("MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEST_DSN required for SQL regression")
	}
	m, e := NewMySQL(dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer m.Close()
	conn, e := m.db.Conn(t.Context())
	if e != nil {
		t.Fatal(e)
	}
	defer conn.Close()
	statements := []string{
		"CREATE TEMPORARY TABLE users (id VARCHAR(64) PRIMARY KEY, phone VARCHAR(64), archived BOOLEAN, version BIGINT)",
		"CREATE TEMPORARY TABLE phone_owners (id VARCHAR(64) PRIMARY KEY,owner_id VARCHAR(64),version BIGINT,`user` VARCHAR(64))",
		"INSERT INTO users VALUES ('existing','13900000001',0,99),('new','13900000002',0,88),('archived','13900000003',1,77),('empty','',0,66)",
		"INSERT INTO phone_owners VALUES ('13900000001','',7,'existing')",
	}
	for _, q := range statements {
		if _, e = conn.ExecContext(t.Context(), q); e != nil {
			t.Fatal(e)
		}
	}
	// Existing and newly created reservations must both succeed. Re-running
	// tests the duplicate-update branch and must not copy users.version.
	for attempt := 0; attempt < 2; attempt++ {
		if _, e = conn.ExecContext(t.Context(), userPhoneOwnersBackfill); e != nil {
			t.Fatal(e)
		}
		var total int
		if e = conn.QueryRowContext(t.Context(), "SELECT COUNT(*) FROM phone_owners").Scan(&total); e != nil || total != 2 {
			t.Fatal("unexpected rows", total, e)
		}
		for phone, want := range map[string]int{"13900000001": 8 + attempt, "13900000002": 1 + attempt} {
			var version int
			if e = conn.QueryRowContext(t.Context(), "SELECT version FROM phone_owners WHERE id=?", phone).Scan(&version); e != nil || version != want {
				t.Fatal("wrong target version", version, want, e)
			}
		}
	}
}
