package virtualpay

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
)

func TestPaidStagesWithWrappedMetadataRecoverPackageCreditOnce(t *testing.T) {
	for _, status := range []int{2, 3, 4} {
		t.Run(fmt.Sprintf("paid-stage-%d", status), func(t *testing.T) {
			f := newFixture(t)
			o := f.order
			o.AmountFen, o.PointsUnits = 10, 1000000
			o.Virtual.PointsUnits, o.Virtual.Quantity, o.Virtual.UnitFen = 1000000, 1, 10
			o.Virtual.Issued, o.Virtual.PurchaseMode = true, "package"
			if _, err := f.svc.Store.Put(t.Context(), "orders", core.Record{ID: f.row.ID, Owner: "u", Data: core.Data(o)}, f.row.Version); err != nil {
				t.Fatal(err)
			}
			f.remote.Status, f.remote.Fee, f.remote.Paid, f.remote.Left = status, 10, 10, 10
			f.remote.Meta = string(core.Data(map[string]string{"attach": f.row.ID}))
			for range 3 {
				if err := f.svc.Refresh(t.Context(), f.row.ID); err != nil {
					t.Fatal("verified paid order did not recover", err)
				}
			}
			wallet, err := f.svc.Billing.Wallet(t.Context(), "u")
			if err != nil || wallet.Available != 1000000 || wallet.Held != 0 {
				t.Fatal("package credit was changed or duplicated", wallet, err)
			}
			ledger, _ := f.svc.Store.List(t.Context(), "wallet_ledger", "u")
			if len(ledger) != 1 || f.deliveries != 0 && status == 4 {
				t.Fatal("recovery repeated credit or acknowledged an already delivered order", len(ledger), f.deliveries)
			}
			stored, err := f.svc.Store.Get(t.Context(), "orders", f.row.ID)
			var confirmed core.Order
			if err != nil || json.Unmarshal(stored.Data, &confirmed) != nil || confirmed.Status != "paid" || !confirmed.Virtual.Delivered {
				t.Fatal("recovered order did not complete delivery", err)
			}
		})
	}
}

func TestConcurrentDeliveringCallbacksWithWrappedMetadataCreditOnce(t *testing.T) {
	f := newFixture(t)
	o := f.order
	o.Virtual.Issued = true
	if _, err := f.svc.Store.Put(t.Context(), "orders", core.Record{ID: f.row.ID, Owner: "u", Data: core.Data(o)}, f.row.Version); err != nil {
		t.Fatal(err)
	}
	f.remote.Status = 3
	f.remote.Meta = string(core.Data(map[string]string{"attach": f.row.ID}))
	original := f.svc.Client.HTTP
	f.svc.Client.HTTP = doFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/xpay/notify_provide_goods" {
			return response(200, map[string]int{"errcode": 0}), nil
		}
		return original.Do(req)
	})
	var event Event
	raw := core.Data(map[string]any{"Event": "xpay_goods_deliver_notify", "OutTradeNo": f.row.ID, "OpenId": "openid", "Env": 1,
		"GoodsInfo": map[string]any{"ProductId": o.Virtual.ProductID, "Quantity": 1, "OrigPrice": 100, "ActualPrice": 100, "Attach": f.row.ID}})
	if err := json.Unmarshal(raw, &event); err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	for range 12 {
		group.Go(func() {
			if err := f.svc.Handle(t.Context(), event); err != nil {
				t.Error(err)
			}
		})
	}
	group.Wait()
	wallet, err := f.svc.Billing.Wallet(t.Context(), "u")
	ledger, _ := f.svc.Store.List(t.Context(), "wallet_ledger", "u")
	if err != nil || wallet.Available != 10000 || wallet.Held != 0 || len(ledger) != 1 {
		t.Fatal("paid callbacks duplicated the wallet credit", wallet, len(ledger), err)
	}
}

func TestWrappedMetadataNeverBypassesPaymentIdentityAndAmountChecks(t *testing.T) {
	for _, field := range []string{"foreign-attach", "extra-metadata", "order", "env", "type", "fee", "paid", "transaction", "time"} {
		t.Run(field, func(t *testing.T) {
			f := newFixture(t)
			f.remote.Status = 3
			f.remote.Meta = string(core.Data(map[string]string{"attach": f.row.ID}))
			switch field {
			case "foreign-attach":
				f.remote.Meta = `{"attach":"another-order"}`
			case "extra-metadata":
				f.remote.Meta = string(core.Data(map[string]string{"attach": f.row.ID, "unknown": "value"}))
			case "order":
				f.remote.ID = "another-order"
			case "env":
				f.remote.Env = 1
			case "type":
				f.remote.Type = 1
			case "fee":
				f.remote.Fee++
			case "paid":
				f.remote.Paid++
			case "transaction":
				f.remote.WXID = ""
			case "time":
				f.remote.PaidTime = 0
			}
			if err := f.svc.Refresh(t.Context(), f.row.ID); err == nil {
				t.Fatal("mismatched paid response accepted")
			}
			wallet, _ := f.svc.Billing.Wallet(t.Context(), "u")
			ledger, _ := f.svc.Store.List(t.Context(), "wallet_ledger", "u")
			if wallet.Available != 0 || wallet.Held != 0 || len(ledger) != 0 || f.deliveries != 0 {
				t.Fatal("mismatched response changed funds or acknowledged delivery")
			}
		})
	}
}
