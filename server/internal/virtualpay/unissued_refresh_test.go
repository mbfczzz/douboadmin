package virtualpay

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"testing"
)

func TestReconcileSkipsUnissuedPurchasesWithoutChangingFunds(t *testing.T) {
	f := newFixture(t)
	o := f.order
	o.Virtual.PurchaseMode = "package"
	if _, err := f.svc.Store.Put(t.Context(), "orders", core.Record{ID: f.row.ID, Owner: "u", Data: core.Data(o)}, f.row.Version); err != nil {
		t.Fatal(err)
	}
	calls := 0
	f.svc.Client.HTTP = doFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return response(200, map[string]any{"errcode": 268490002}), nil
	})
	f.svc.Reconcile(t.Context())
	wallet, err := f.svc.Billing.Wallet(t.Context(), "u")
	if err != nil || calls != 0 || wallet.Available != 0 || wallet.Held != 0 {
		t.Fatal("unissued purchase was probed or credited", calls, wallet, err)
	}
}

func TestAuthenticatedPaymentStillReconcilesWithoutIssuedMarker(t *testing.T) {
	f := newFixture(t)
	o := f.order
	o.Virtual.PurchaseMode = "package"
	if _, err := f.svc.Store.Put(t.Context(), "orders", core.Record{ID: f.row.ID, Owner: "u", Data: core.Data(o)}, f.row.Version); err != nil {
		t.Fatal(err)
	}
	env := 1
	var event Event
	raw := core.Data(map[string]any{"Event": "xpay_goods_deliver_notify", "OutTradeNo": f.row.ID, "OpenId": "openid", "Env": env,
		"GoodsInfo": map[string]any{"ProductId": o.Virtual.ProductID, "Quantity": 1, "OrigPrice": 100, "ActualPrice": 100, "Attach": f.row.ID}})
	if err := json.Unmarshal(raw, &event); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.Handle(t.Context(), event); err != nil {
		t.Fatal("authenticated notification lost its payment reconciliation path", err)
	}
	wallet, err := f.svc.Billing.Wallet(t.Context(), "u")
	if err != nil || wallet.Available != 10000 {
		t.Fatal(wallet, err)
	}
}
