package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"testing"
)

func TestVirtualUnissuedOrderRefreshUsesLocalState(t *testing.T) {
	for _, admin := range []bool{false, true} {
		a, user, other := virtualFixture(t)
		row := virtualOrder(t, a, user)
		original, err := a.Store.Get(t.Context(), "orders", row.ID)
		if err != nil {
			t.Fatal(err)
		}
		calls := 0
		a.Virtual.Client.HTTP = virtualHTTP(func(*http.Request) (*http.Response, error) {
			calls++
			return virtualResponse(map[string]any{"errcode": 268490002, "errmsg": "order_id not exists"}), nil
		})
		path := "/api/orders/" + row.ID + "/refresh"
		if w := call(a, "POST", path, other, "", map[string]any{}); w.Code != 404 {
			t.Fatal("another user can inspect the order", w.Code)
		}
		actor := user
		if admin {
			var err error
			actor, err = a.Sessions.Create(t.Context(), "admin", "admin")
			if err != nil {
				t.Fatal(err)
			}
			path = "/api/admin/orders/" + row.ID + "/refresh"
		}
		w := call(a, "POST", path, actor, "", map[string]any{})
		var refreshed core.Record
		var order core.Order
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &refreshed) != nil || json.Unmarshal(refreshed.Data, &order) != nil || order.Status != "created" || order.Virtual.Issued {
			t.Fatal("unissued order did not remain pending payment", w.Code, w.Body.String())
		}
		stored, err := a.Store.Get(t.Context(), "orders", row.ID)
		if err != nil || string(stored.Data) != string(original.Data) || stored.Version != row.Version || calls != 0 {
			t.Fatal("refresh changed or queried an unissued order", err, calls)
		}
		wallet, err := a.Billing.Wallet(t.Context(), row.Owner)
		if err != nil || wallet.Available != 0 || wallet.Held != 0 {
			t.Fatal("refresh changed unpaid credit", wallet, err)
		}
	}
}

func TestVirtualIssuedAndLegacyOrdersStillQueryWechat(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		a, user, _ := virtualFixture(t)
		row := virtualOrder(t, a, user)
		row, err := a.Store.Get(t.Context(), "orders", row.ID)
		if err != nil {
			t.Fatal(err)
		}
		var order core.Order
		_ = json.Unmarshal(row.Data, &order)
		if legacy {
			order.Virtual.PurchaseMode = ""
		} else {
			order.Virtual.Issued = true
		}
		row.Data = core.Data(order)
		if _, err := a.Store.Put(t.Context(), "orders", row, row.Version); err != nil {
			t.Fatal(err)
		}
		queries := 0
		a.Virtual.Client.HTTP = virtualHTTP(func(r *http.Request) (*http.Response, error) {
			if r.URL.Path == "/cgi-bin/stable_token" {
				return virtualResponse(map[string]any{"access_token": "fixture-token", "expires_in": 7200}), nil
			}
			queries++
			return virtualResponse(map[string]any{"errcode": 268490002, "errmsg": "fixture rejected query"}), nil
		})
		w := call(a, "POST", "/api/orders/"+row.ID+"/refresh", user, "", map[string]any{})
		if w.Code != 502 || queries != 1 {
			t.Fatal("issued or legacy order bypassed WeChat verification", w.Code, queries)
		}
	}
}
