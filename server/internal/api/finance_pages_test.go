package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"testing"
)

func TestFinanceListsReachRecordsBeyondLegacyLimit(t *testing.T) {
	a, user, other := setup(t)
	admin, e := a.Sessions.Create(t.Context(), "admin-fixture", "admin")
	if e != nil {
		t.Fatal(e)
	}
	for i := range 521 {
		id := fmt.Sprintf("finance-%04d", i)
		for namespace, data := range map[string]any{
			"orders":        core.Order{UserID: "user-a", Status: "paid", OpenID: "private-openid", PrepayID: "private-prepay", RequestHash: "private-hash"},
			"refunds":       core.Refund{UserID: "user-a", OrderID: id, Status: "pending"},
			"wallet_ledger": core.LedgerEntry{UserID: "user-a", Reference: "private-reference", Actor: "private-actor", Kind: "topup", Note: id},
		} {
			if _, e = a.Store.Put(t.Context(), namespace, core.Record{ID: id, Owner: "user-a", Data: core.Data(data)}, 0); e != nil {
				t.Fatal(e)
			}
		}
	}
	for _, item := range []struct{ path, token string }{
		{"/api/orders", user}, {"/api/admin/orders", admin}, {"/api/admin/refunds", admin},
		{"/api/wallet/ledger", user}, {"/api/admin/users/user-a/ledger", admin},
	} {
		seen := map[string]bool{}
		for page := 1; page <= 27; page++ {
			w := call(a, "GET", fmt.Sprintf("%s?page=%d&size=20", item.path, page), item.token, "", nil)
			if w.Code != 200 {
				t.Fatal(item.path, w.Code, w.Body.String())
			}
			var result core.RecordPage
			if e = json.Unmarshal(w.Body.Bytes(), &result); e != nil {
				t.Fatal(e)
			}
			if result.Total != 521 || result.Page != page || result.Size != 20 {
				t.Fatal(result)
			}
			for _, row := range result.Items {
				if seen[row.ID] {
					t.Fatal("duplicate across pages", row.ID)
				}
				seen[row.ID] = true
				if item.path == "/api/orders" {
					var order core.Order
					_ = json.Unmarshal(row.Data, &order)
					if order.OpenID != "" || order.PrepayID != "" || order.RequestHash != "" {
						t.Fatal("payment secrets exposed")
					}
				}
				if item.path == "/api/wallet/ledger" {
					var ledger core.LedgerEntry
					_ = json.Unmarshal(row.Data, &ledger)
					if ledger.Actor != "" || ledger.Reference != "" {
						t.Fatal("ledger internals exposed")
					}
				}
			}
		}
		if len(seen) != 521 {
			t.Fatal(item.path, len(seen))
		}
	}
	w := call(a, "GET", "/api/orders?page=1", other, "", nil)
	var page core.RecordPage
	_ = json.Unmarshal(w.Body.Bytes(), &page)
	if w.Code != 200 || page.Total != 0 {
		t.Fatal("owner filter failed", w.Body.String())
	}
}

func TestFinancePagesValidateAndFilterBeforePaging(t *testing.T) {
	a, user, _ := setup(t)
	admin, _ := a.Sessions.Create(t.Context(), "admin-fixture", "admin")
	for _, query := range []string{"page=0", "page=abc", "page=1000001", "page=1&size=0", "page=1&size=101"} {
		if w := call(a, "GET", "/api/orders?"+query, user, "", nil); w.Code != 400 {
			t.Fatal(query, w.Code)
		}
	}
	for i := range 30 {
		status := "paid"
		if i < 25 {
			status = "created"
		}
		_, e := a.Store.Put(t.Context(), "orders", core.Record{ID: fmt.Sprintf("wanted-%02d", i), Owner: "user-a", Data: core.Data(core.Order{UserID: "user-a", Status: status})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	w := call(a, "GET", "/api/admin/orders?page=2&size=20&status=created&q=wanted", admin, "", nil)
	var page core.RecordPage
	_ = json.Unmarshal(w.Body.Bytes(), &page)
	if w.Code != 200 || page.Total != 25 || len(page.Items) != 5 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/orders?page=1&q=private-openid", user, "", nil); w.Code != 400 {
		t.Fatal("user search could probe private payment fields", w.Code)
	}
}
