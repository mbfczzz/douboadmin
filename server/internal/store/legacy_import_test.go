package store

import (
	"testing"
)

func TestMySQLMigrateImportsLegacyRecords(t *testing.T) {
	s := mysqlFixture(t)
	db := s.db
	ids := []any{"legacy-user", "legacy-bad", "distribution", "legacy-code"}
	cleanup := func() {
		_, _ = db.Exec(`DROP TABLE IF EXISTS records`)
		_, _ = db.Exec(`DELETE FROM users WHERE id IN (?,?)`, ids[0], ids[1])
		_, _ = db.Exec(`DELETE FROM distribution_policy WHERE id=?`, ids[2])
	}
	cleanup()
	t.Cleanup(cleanup)
	if _, err := db.Exec(`CREATE TABLE records (namespace VARCHAR(64), id VARCHAR(64), owner_id VARCHAR(64), version BIGINT, data JSON, created_at DATETIME(6))`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO records VALUES
		('users','legacy-user','legacy-user',3,'{"nickname":"老用户","avatarUrl":"gone","disabled":false}','2026-01-02 03:04:05'),
		('users','legacy-bad','legacy-bad',1,'{"disabled":"broken"}','2026-01-02 03:04:05'),
		('settings','distribution','',2,'{"enabled":true,"costPer100Fen":8000,"rootMarginBps":5000}','2026-01-02 03:04:05'),
		('activation_codes','legacy-code','',1,'{}','2026-01-02 03:04:05')`); err != nil {
		t.Fatal(err)
	}
	for range 2 { // a second run changes nothing
		if err := s.Migrate(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	user, err := s.Get(t.Context(), "users", "legacy-user")
	if err != nil || user.Version != 3 || user.Owner != "legacy-user" || user.CreatedAt.Year() != 2026 || string(user.Data) != `{"disabled":false,"nickname":"老用户"}` {
		t.Fatal(user, string(user.Data), err)
	}
	if _, err = s.Get(t.Context(), "users", "legacy-bad"); err == nil {
		t.Fatal("a row with a wrongly typed value was imported")
	}
	policy, err := s.Get(t.Context(), "distribution_policy", "distribution")
	if err != nil || policy.Version != 2 || string(policy.Data) != `{"costPer100Fen":8000,"enabled":true,"rootMarginBps":5000}` {
		t.Fatal(policy, string(policy.Data), err)
	}
}
