package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
	"encoding/json"
	"testing"
)

func customFixture(t *testing.T) (*Server, string) {
	t.Helper()
	a, user, _ := virtualFixture(t)
	a.Virtual.Client.Config.CustomProductID = "pack"
	return a, user
}

func TestVirtualCustomAmountSnapshotSignatureAndIdempotency(t *testing.T) {
	a, user := customFixture(t)
	w := call(a, "GET", "/api/wallet", user, "", nil)
	var info struct {
		Custom *virtualpay.CustomPurchase `json:"virtualCustom"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &info) != nil || info.Custom == nil || info.Custom.UnitAmountFen != 100 {
		t.Fatal(w.Code, w.Body.String())
	}
	input := map[string]any{"purchaseMode": "custom", "amountFen": 500, "settingsVersion": 1, "platform": "android"}
	w = call(a, "POST", "/api/orders", user, "custom-amount-order", input)
	var row core.Record
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	var order core.Order
	_ = json.Unmarshal(row.Data, &order)
	if order.AmountFen != 500 || order.PointsUnits != 50000 || order.Virtual.Quantity != 5 || order.Virtual.UnitFen != 100 || order.Virtual.PurchaseMode != "custom" {
		t.Fatal(order)
	}
	if w = call(a, "POST", "/api/orders", user, "custom-amount-order", input); w.Code != 201 {
		t.Fatal("same request should reuse its order", w.Code, w.Body.String())
	}
	input["amountFen"] = 600
	if w = call(a, "POST", "/api/orders", user, "custom-amount-order", input); w.Code != 409 {
		t.Fatal("changed amount reused an idempotency key", w.Code)
	}
	w = call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "fresh", "platform": "android"})
	var params virtualpay.Params
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &params) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	var signed struct {
		Quantity int64 `json:"buyQuantity"`
		Price    int64 `json:"goodsPrice"`
	}
	if json.Unmarshal([]byte(params.SignData), &signed) != nil || signed.Quantity != 5 || signed.Price != 100 {
		t.Fatal("signed a total price instead of a unit price", params.SignData)
	}
	if params.PaySig != virtualpay.MAC("sandbox", "requestVirtualPayment&"+params.SignData) {
		t.Fatal("quantity and price were not covered by the payment signature")
	}
}

func TestVirtualCustomRejectsInvalidAmountsAndForgedProducts(t *testing.T) {
	for _, change := range []map[string]any{
		{"amountFen": 0}, {"amountFen": -100}, {"amountFen": 150}, {"amountFen": core.MaxOrderAmountFen + 100},
		{"amountFen": 100.5}, {"productId": "other"}, {"purchaseMode": "unknown"}, {"settingsVersion": 0},
	} {
		a, user := customFixture(t)
		input := map[string]any{"purchaseMode": "custom", "amountFen": 500, "settingsVersion": 1, "platform": "android"}
		for key, value := range change {
			input[key] = value
		}
		w := call(a, "POST", "/api/orders", user, "invalid-custom-order", input)
		if w.Code != 400 && w.Code != 409 {
			t.Fatal(change, w.Code, w.Body.String())
		}
		orders, _ := a.Store.List(t.Context(), "orders", "user-a")
		ledger, _ := a.Store.List(t.Context(), "wallet_ledger", "user-a")
		if len(orders) != 0 || len(ledger) != 0 {
			t.Fatal("invalid checkout changed financial records")
		}
	}
}

func TestVirtualCustomCanUseUnitBelowRechargeMinimum(t *testing.T) {
	a, user := customFixture(t)
	a.Virtual.Client.Config.Products[0].AmountFen = 10
	a.Virtual.Client.Config.Products[0].PointsUnits = 1000
	w := call(a, "GET", "/api/wallet", user, "", nil)
	var info struct {
		Ready    bool                       `json:"paymentReady"`
		Products []virtualpay.Product       `json:"virtualProducts"`
		Custom   *virtualpay.CustomPurchase `json:"virtualCustom"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &info)
	if !info.Ready || len(info.Products) != 1 || info.Custom == nil || info.Custom.MinAmountFen != 10 {
		t.Fatal(w.Body.String())
	}
	input := map[string]any{"purchaseMode": "custom", "amountFen": 100, "settingsVersion": 1, "platform": "android"}
	if w = call(a, "POST", "/api/orders", user, "minimum-custom-order", input); w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	input["platform"] = "ios"
	a.Virtual.Client.Config.Env, a.Virtual.Client.Config.IOSAllowed = 0, true
	a.Virtual.Client.Config.AppKey = "live-key"
	if w = call(a, "POST", "/api/orders", user, "ios-small-unit-order", input); w.Code != 403 {
		t.Fatal("unsupported iOS unit price was allowed", w.Code)
	}
}

func TestVirtualCustomIsOptionalAndCatalogPriceChangesBlockSigning(t *testing.T) {
	a, user := customFixture(t)
	a.Virtual.Client.Config.CustomProductID = ""
	input := map[string]any{"purchaseMode": "custom", "amountFen": 500, "settingsVersion": 1, "platform": "android"}
	if w := call(a, "POST", "/api/orders", user, "disabled-custom-order", input); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	// Legacy, single-package clients keep working with no new fields.
	row := virtualOrder(t, a, user)
	a.Virtual.Client.Config.Products[0].AmountFen++
	w := call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "fresh", "platform": "android"})
	if w.Code != 409 {
		t.Fatal("changed unit price was signed", w.Code, w.Body.String())
	}
}

func TestVirtualCheckoutRejectsIdentityFromAnotherWechatApp(t *testing.T) {
	a, user := customFixture(t)
	row, err := a.Store.Get(t.Context(), "wechat_identities", "user-a")
	if err != nil {
		t.Fatal(err)
	}
	row.Data = core.Data(map[string]string{"openid": "openid-a", "appid": "previous-app"})
	if _, err = a.Store.Put(t.Context(), "wechat_identities", row, row.Version); err != nil {
		t.Fatal(err)
	}
	w := call(a, "POST", "/api/orders", user, "another-app-checkout", map[string]any{
		"purchaseMode": "custom", "amountFen": 500, "settingsVersion": 1, "platform": "android"})
	if w.Code != 401 {
		t.Fatal("an old app identity created a payment under the new app", w.Code, w.Body.String())
	}
	orders, _ := a.Store.List(t.Context(), "orders", "user-a")
	if len(orders) != 0 {
		t.Fatal("cross-app checkout left a new order behind")
	}
}
