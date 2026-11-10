package store

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
	"testing"
	"time"
)

func checkPaymentRecords(t *testing.T, s Store, prefix string) {
	t.Helper()
	ctx := context.Background()
	paid := time.Now().Add(-time.Hour)
	for i := range 505 {
		id := fmt.Sprintf("%s-%03d", prefix, i)
		status := "paid"
		if i == 0 {
			status = "refunded"
		}
		order := core.Order{UserID: prefix, TransactionID: id, AmountFen: 123, PointsUnits: 12300, Status: status, PaidAt: &paid, Channel: "wechat_jsapi", OpenID: "private-openid"}
		if _, e := s.Put(ctx, "orders", core.Record{ID: id, Owner: prefix, Data: core.Data(order)}, 0); e != nil {
			t.Fatal(e)
		}
		if _, e := s.Put(ctx, "payment_transactions", core.Record{ID: id, Owner: prefix, Data: core.Data(id)}, 0); e != nil {
			t.Fatal(e)
		}
	}
	_, _ = s.Put(ctx, "orders", core.Record{ID: prefix + "-unpaid", Owner: prefix, Data: core.Data(core.Order{UserID: prefix, Status: "created"})}, 0)
	q := core.PaymentQuery{Search: prefix, Page: 1, Size: 20}
	first, e := s.PaymentRecords(ctx, q)
	if e != nil || first.Total != 505 || len(first.Items) != 20 {
		t.Fatal(first.Total, len(first.Items), e)
	}
	q.Page = 26
	last, e := s.PaymentRecords(ctx, q)
	if e != nil || len(last.Items) != 5 || last.Total != 505 {
		t.Fatal("older payments truncated", last, e)
	}
	seen := map[string]bool{}
	for _, v := range first.Items {
		seen[v.TransactionID] = true
	}
	for _, v := range last.Items {
		if seen[v.TransactionID] {
			t.Fatal("duplicate page entry")
		}
	}
	q.Page = 1
	q.Status = "refunded"
	refunded, e := s.PaymentRecords(ctx, q)
	if e != nil || refunded.Total != 1 || refunded.Items[0].TransactionID != prefix+"-000" {
		t.Fatal(refunded, e)
	}
	q.Status = ""
	q.From = time.Now().Add(24 * time.Hour)
	future, e := s.PaymentRecords(ctx, q)
	if e != nil || future.Total != 0 {
		t.Fatal(future, e)
	}
	q.From = time.Time{}
	q.Until = time.Now().Add(-time.Minute)
	before, e := s.PaymentRecords(ctx, q)
	if e != nil || before.Total != 0 {
		t.Fatal("filtered by upstream payment time instead of credit time", before.Total, e)
	}
	q.Until = time.Time{}
	q.Search = prefix + "-017"
	exact, e := s.PaymentRecords(ctx, q)
	if e != nil || exact.Total != 1 || exact.Items[0].AmountFen != 123 {
		t.Fatal(exact, e)
	}
}
func TestMemoryPaymentRecordsPageBeyondRecentList(t *testing.T) {
	checkPaymentRecords(t, NewMemory(), "payment-record")
}
func TestMySQLPaymentRecordsPageBeyondRecentList(t *testing.T) {
	s := mysqlFixture(t)
	owner := "pr-" + core.NewID()
	t.Cleanup(func() { deleteOwned(s, owner, "orders", "payment_transactions") })
	checkPaymentRecords(t, s, owner)
}
