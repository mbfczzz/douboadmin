package store

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
	"testing"
)

func checkPendingPayments(t *testing.T, s Store, owner string) {
	t.Helper()
	ctx := context.Background()
	for i := range 505 {
		status := "paid"
		if i == 0 || i == 504 {
			status = "created"
		}
		_, e := s.Put(ctx, "orders", core.Record{ID: fmt.Sprintf("%s-%03d", owner, i), Owner: owner, Data: core.Data(core.Order{Status: status})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	first, e := s.PendingPayments(ctx, "orders", owner, 1)
	if e != nil || len(first) != 1 || first[0].ID != owner+"-000" {
		t.Fatal(first, e)
	}
	last, e := s.PendingPayments(ctx, "orders", first[0].ID, 1)
	if e != nil || len(last) != 1 || last[0].ID != owner+"-504" {
		t.Fatal(last, e)
	}
	_, e = s.PendingPayments(ctx, "users", "", 20)
	if e == nil {
		t.Fatal("non-payment namespace accepted")
	}
}
func TestMemoryPendingPaymentsIncludeOldRows(t *testing.T) {
	checkPendingPayments(t, NewMemory(), "pending")
}
func TestMySQLPendingPaymentsIncludeOldRows(t *testing.T) {
	m := mysqlFixture(t)
	owner := "pending-" + core.NewID()
	t.Cleanup(func() { _, _ = m.db.Exec(`DELETE FROM orders WHERE owner_id=?`, owner) })
	checkPendingPayments(t, m, owner)
}
