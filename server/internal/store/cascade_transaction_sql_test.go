package store

import (
	"doubo/server/internal/core"
	"errors"
	"os"
	"strings"
	"testing"
)

// Pin the pool to one physical connection. These tables are temporary shadows;
// persistent partners and audit records are never touched, even on rollback.
func TestMySQLCascadeSnapshotAndRollback(t *testing.T) {
	dsn := os.Getenv("MYSQL_TEMP_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEMP_TEST_DSN enables temporary-table transaction checks")
	}
	m, e := NewMySQL(dsn)
	if e != nil {
		t.Fatal("invalid database configuration")
	}
	defer m.Close()
	m.db.SetMaxOpenConns(1)
	m.db.SetMaxIdleConns(1)
	m.db.SetConnMaxLifetime(0)
	guard := "cascade_guard_" + core.NewID()
	if _, e = m.db.ExecContext(t.Context(), "CREATE TEMPORARY TABLE `"+guard+"` (ok INT)"); e != nil {
		t.Fatal(e)
	}
	checkConnection := func(tx Transaction) error {
		var count int
		return tx.(*mysqlTransaction).tx.QueryRowContext(t.Context(), "SELECT COUNT(*) FROM `"+guard+"`").Scan(&count)
	}
	for _, ns := range []string{"partners", "partner_audit"} {
		table, e := tableOf(ns)
		if e != nil {
			t.Fatal(e)
		}
		ddl := strings.Replace(table.DDL(), "CREATE TABLE IF NOT EXISTS", "CREATE TEMPORARY TABLE", 1)
		if _, e = m.db.ExecContext(t.Context(), ddl); e != nil {
			t.Fatal(e)
		}
	}
	e = m.Atomic(t.Context(), func(tx Transaction) error {
		if e := checkConnection(tx); e != nil {
			return e
		}
		for range 505 {
			id := core.NewID()
			if _, e := tx.Put("partners", core.Record{ID: id, Data: core.Data(core.Partner{Name: "temporary fixture", Role: "s1", Status: "active"})}, 0); e != nil {
				return e
			}
		}
		return nil
	})
	if e != nil {
		t.Fatal(e)
	}
	injected := errors.New("abort after cascade writes")
	e = m.Atomic(t.Context(), func(tx Transaction) error {
		if e := checkConnection(tx); e != nil {
			return e
		}
		rows, e := tx.Records("partners")
		if e != nil {
			return e
		}
		if len(rows) != 505 {
			return errors.New("snapshot was truncated")
		}
		for _, row := range rows {
			row.Data = core.Data(core.Partner{Status: "deleted"})
			if _, e = tx.Put("partners", row, row.Version); e != nil {
				return e
			}
		}
		if _, e = tx.Put("partner_audit", core.Record{ID: core.NewID(), Data: core.Data(map[string]string{"kind": "temporary-cascade"})}, 0); e != nil {
			return e
		}
		return injected
	})
	if !errors.Is(e, injected) {
		t.Fatal(e)
	}
	var active, audits int
	if e = m.db.QueryRowContext(t.Context(), "SELECT COUNT(*) FROM partners WHERE status='active' AND version=1").Scan(&active); e != nil {
		t.Fatal(e)
	}
	if e = m.db.QueryRowContext(t.Context(), "SELECT COUNT(*) FROM partner_audit").Scan(&audits); e != nil {
		t.Fatal(e)
	}
	if active != 505 || audits != 0 {
		t.Fatal("rollback left partial state", active, audits)
	}
}
