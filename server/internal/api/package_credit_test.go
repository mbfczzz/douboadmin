package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
	"encoding/json"
	"testing"
)

func TestSmallPackageOwnsPriceAndCreditDespiteRetiredRules(t *testing.T) {
	a, user, _ := virtualFixture(t)
	a.Virtual.Client.Config.Products[0].AmountFen = 10
	a.Virtual.Client.Config.Products[0].PointsUnits = 1000000
	legacy := core.PlatformSettings{PointsPerYuan: 0, MinRechargeFen: 10000, MaxRechargeFen: 1}
	_, err := a.Store.Put(t.Context(), "settings", core.Record{ID: "platform", Data: core.Data(legacy)}, 1)
	if err != nil {
		t.Fatal(err)
	}
	w := call(a, "GET", "/api/wallet", user, "", nil)
	var info struct {
		Ready    bool                 `json:"paymentReady"`
		Products []virtualpay.Product `json:"virtualProducts"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &info) != nil || !info.Ready || len(info.Products) != 1 || info.Products[0].PointsUnits != 1000000 {
		t.Fatal(w.Code, w.Body.String())
	}
	input := map[string]any{"productId": "pack", "amountFen": 10, "settingsVersion": 2, "platform": "android", "expectedPointsUnits": 1000000}
	w = call(a, "POST", "/api/orders", user, "independent-package", input)
	var row core.Record
	var order core.Order
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &row) != nil || json.Unmarshal(row.Data, &order) != nil || order.AmountFen != 10 || order.PointsUnits != 1000000 {
		t.Fatal(w.Code, w.Body.String())
	}
	// Changing credit requires a new customer confirmation even if the price is unchanged.
	a.Virtual.Client.Config.Products[0].PointsUnits = 900000
	w = call(a, "POST", "/api/orders", user, "stale-package-credit", input)
	if w.Code != 409 {
		t.Fatal("stale package credit silently repriced", w.Code)
	}
	input["expectedPointsUnits"] = 900000
	input["pointsUnits"] = 999999999
	if w = call(a, "POST", "/api/orders", user, "forged-package-credit", input); w.Code != 400 {
		t.Fatal("client supplied credit accepted", w.Code)
	}
	rows, _ := a.Store.List(t.Context(), "orders", "user-a")
	if len(rows) != 1 {
		t.Fatal("invalid checkout left a financial record", len(rows))
	}
}
