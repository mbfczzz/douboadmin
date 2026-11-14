package api

import (
	"encoding/json"
	"fmt"
	"testing"

	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
)

func iosPaymentFixture(t *testing.T, unit int64) (*Server, string) {
	t.Helper()
	a, user, _ := virtualFixture(t)
	cfg := &a.Virtual.Client.Config
	cfg.Env, cfg.IOSAllowed, cfg.AppKey = 0, true, "fixture-live-key"
	cfg.Products[0].AmountFen = unit
	return a, user
}

func TestIOSMinimumPriceAtCreationAndSigning(t *testing.T) {
	for _, unit := range []int64{9, 10, 11, 100} {
		t.Run(fmt.Sprint(unit), func(t *testing.T) {
			a, user := iosPaymentFixture(t, unit)
			w := call(a, "POST", "/api/orders", user, "ios-floor-create", map[string]any{
				"productId": "pack", "settingsVersion": 0, "amountFen": unit, "platform": "iOS",
			})
			if unit < 10 {
				if w.Code != 403 {
					t.Fatal("sub-floor order accepted", w.Code)
				}
				orders, _ := a.Store.List(t.Context(), "orders", "user-a")
				if len(orders) != 0 {
					t.Fatal("rejected checkout created an order")
				}
				return
			}
			var row core.Record
			if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
				t.Fatal(w.Code, w.Body.String())
			}
			var order core.Order
			_ = json.Unmarshal(row.Data, &order)
			if order.AmountFen != unit || order.Virtual.UnitFen != unit {
				t.Fatal("price changed")
			}
			w = call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "fresh", "platform": "iOS"})
			var params virtualpay.Params
			if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &params) != nil {
				t.Fatal(w.Code, w.Body.String())
			}
			var signed struct {
				Price int64 `json:"goodsPrice"`
			}
			if json.Unmarshal([]byte(params.SignData), &signed) != nil || signed.Price != unit {
				t.Fatal("wrong signed unit price")
			}
			if params.PaySig != virtualpay.MAC("fixture-live-key", "requestVirtualPayment&"+params.SignData) {
				t.Fatal("wrong payment signature")
			}
		})
	}
}

func TestIOSCannotPayAnAndroidOrderBelowUnitOrTotalMinimum(t *testing.T) {
	for _, total := range []int64{5, 10, 100} {
		a, user := iosPaymentFixture(t, 5)
		a.Virtual.Client.Config.CustomProductID = "pack"
		w := call(a, "POST", "/api/orders", user, "android-low-unit", map[string]any{
			"purchaseMode": "custom", "amountFen": total, "settingsVersion": 0, "platform": "android",
		})
		var row core.Record
		if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		w = call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "fresh", "platform": "ios"})
		if w.Code != 403 {
			t.Fatal("sub-floor unit was signed on iOS", total, w.Code)
		}
		stored, _ := a.Store.Get(t.Context(), "orders", row.ID)
		var order core.Order
		_ = json.Unmarshal(stored.Data, &order)
		if order.Virtual.Issued {
			t.Fatal("rejected payment issued a signature")
		}
	}
}

func TestIOSMinimumChangePreservesEnablementAndLiveEnvironmentGuards(t *testing.T) {
	for _, scenario := range []string{"disabled", "sandbox"} {
		t.Run(scenario, func(t *testing.T) {
			a, user := iosPaymentFixture(t, 10)
			if scenario == "disabled" {
				a.Virtual.Client.Config.IOSAllowed = false
			} else {
				a.Virtual.Client.Config.Env = 1
			}
			row := virtualOrder(t, a, user)
			w := call(a, "POST", "/api/orders", user, "ios-policy-guard", map[string]any{"productId": "pack", "settingsVersion": 0, "platform": "ios"})
			if w.Code != 403 {
				t.Fatal("iOS policy bypassed during creation", w.Code)
			}
			w = call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "fresh", "platform": "ios"})
			if w.Code != 403 {
				t.Fatal("iOS policy bypassed during signing", w.Code)
			}
		})
	}
}
