package virtualpay

import (
	"net/http"
	"sync"
	"testing"
)

func TestConcurrentMultipleDeliveryNotificationsCreditOnlyOnce(t *testing.T) {
	f := multipleFixture(t)
	original := f.svc.Client.HTTP
	f.svc.Client.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/xpay/notify_provide_goods" {
			return response(200, map[string]int{"errcode": 0}), nil
		}
		return original.Do(r)
	})
	event := multipleEvent(f, 100)
	var group sync.WaitGroup
	for range 12 {
		group.Go(func() {
			if err := f.svc.Handle(t.Context(), event); err != nil {
				t.Error(err)
			}
		})
	}
	group.Wait()
	wallet, _ := f.svc.Billing.Wallet(t.Context(), "u")
	entries, _ := f.svc.Store.List(t.Context(), "wallet_ledger", "u")
	if wallet.Available != 100000 || wallet.Held != 0 || len(entries) != 1 {
		t.Fatal("concurrent notification duplicated points", wallet, len(entries))
	}
}
