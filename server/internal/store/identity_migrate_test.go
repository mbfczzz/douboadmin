package store

import (
	"doubo/server/internal/core"
	"errors"
	"fmt"
	"strconv"
	"testing"
)

func TestMySQLPhoneUniqueConstraint(t *testing.T) {
	m := mysqlFixture(t)
	suffix, _ := strconv.ParseUint(core.NewID()[:8], 16, 32)
	phone := fmt.Sprintf("139%08d", suffix%100000000)
	first, second := "identity-"+core.NewID(), "identity-"+core.NewID()
	// All rows stay inside this transaction; cleanup also runs on a failed assertion.
	tx, e := m.db.BeginTx(t.Context(), nil)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	row := core.Record{ID: first, Owner: first, Data: core.Data(map[string]any{"phone": phone})}
	if e = putRow(t.Context(), tx, "users", row, 0); e != nil {
		t.Fatal(e)
	}
	row.ID, row.Owner = second, second
	if e = putRow(t.Context(), tx, "users", row, 0); !errors.Is(e, core.ErrUserPhoneTaken) {
		t.Fatal("duplicate phone accepted", e)
	}
	if _, e = tx.ExecContext(t.Context(), `UPDATE users SET archived=1 WHERE id=?`, first); e != nil {
		t.Fatal(e)
	}
	if e = putRow(t.Context(), tx, "users", row, 0); e != nil {
		t.Fatal("archived phone not freed", e)
	}
}
