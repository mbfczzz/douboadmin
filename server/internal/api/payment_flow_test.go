package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestMemberPaymentToGenerationLedger(t *testing.T) {
	a, user, _ := activationFixture(t)
	key := paymentGateway(t, a)
	ctx := t.Context()
	platform := core.DefaultPlatform()
	platform.BillingEnabled, platform.RechargeEnabled = true, true
	if _, err := a.Store.Put(ctx, "settings", core.Record{ID: "platform", Data: core.Data(platform)}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Put(ctx, "wechat_identities", core.Record{ID: "user-a", Data: core.Data(map[string]string{"openid": "test-openid"})}, 0); err != nil {
		t.Fatal(err)
	}
	modelRow, err := a.Store.Get(ctx, "models", "demo-image")
	if err != nil {
		t.Fatal(err)
	}
	var model core.Model
	if err = json.Unmarshal(modelRow.Data, &model); err != nil {
		t.Fatal(err)
	}
	model.Points = 25
	modelRow.Data = core.Data(model)
	if _, err = a.Store.Put(ctx, "models", modelRow, modelRow.Version); err != nil {
		t.Fatal(err)
	}
	activate(t, a, "user-a")
	policy := core.DefaultDistributionPolicy()
	policy.Enabled = true
	if _, err = a.Partners.SavePolicy(ctx, policy, 0, "admin"); err != nil {
		t.Fatal(err)
	}
	quote, _, err := a.Partners.UserQuote(ctx, "user-a", 1000, 100)
	if err != nil || quote == nil {
		t.Fatal(quote, err)
	}
	balance := func(available, held int64) {
		t.Helper()
		w := call(a, "GET", "/api/wallet", user, "", nil)
		var result struct {
			Wallet core.Wallet `json:"wallet"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.Wallet.Available != available || result.Wallet.Held != held {
			t.Fatal(w.Code, w.Body.String(), available, held)
		}
	}
	orderInput := map[string]any{"amountFen": 1000, "settingsVersion": 1, "platform": "android", "pricingVersion": quote.PricingVersion}
	w := call(a, "POST", "/api/orders", user, "payment-flow-order", orderInput)
	var order core.Record
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &order) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "test-openid") {
		t.Fatal("private identity exposed")
	}
	balance(0, 0)
	for _, invalid := range []string{"signature", "amount"} {
		amount := int64(1000)
		if invalid == "amount" {
			amount = 1
		}
		r := signedPayment(t, a, key, order.ID, amount)
		if invalid == "signature" {
			r.Header.Set("Wechatpay-Nonce", "tampered")
		}
		notify := httptest.NewRecorder()
		a.Handler().ServeHTTP(notify, r)
		if notify.Code != 400 {
			t.Fatal(invalid, notify.Code)
		}
		balance(0, 0)
	}
	var group sync.WaitGroup
	for range 8 {
		r := signedPayment(t, a, key, order.ID, 1000)
		group.Go(func() {
			notify := httptest.NewRecorder()
			a.Handler().ServeHTTP(notify, r)
			if notify.Code != 204 {
				t.Error(notify.Code, notify.Body.String())
			}
		})
	}
	group.Wait()
	balance(100000, 0) // ¥10 × 100 points/yuan, with 100 units/point.
	approval := int64(2500)
	in := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "a product photograph",
		Resolution: "1K", Ratio: "1:1", ExpectedCostUnits: &approval}
	bad := in
	bad.Resolution = "unsupported"
	if w = call(a, "POST", "/api/jobs/quote", user, "", bad); w.Code != 400 {
		t.Fatal(w.Code)
	}
	if w = call(a, "POST", "/api/jobs/quote", user, "", in); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "POST", "/api/jobs", user, "payment-flow-job", in)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	balance(97500, 2500)
	if w = call(a, "POST", "/api/jobs", user, "payment-flow-job", in); w.Code != 200 {
		t.Fatal(w.Code)
	}
	balance(97500, 2500)
	claimed, err := a.Store.Claim(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = a.Store.Finish(ctx, claimed, "https://example.test/result.jpg", ""); err != nil {
		t.Fatal(err)
	}
	balance(97500, 0)
	w = call(a, "POST", "/api/jobs", user, "payment-flow-failure", in)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	claimed, err = a.Store.Claim(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = a.Store.Finish(ctx, claimed, "", "upstream explicitly rejected"); err != nil {
		t.Fatal(err)
	}
	balance(97500, 0)
	if _, err = a.Billing.Adjust(ctx, "user-a", "test-empty-wallet", "admin", "test insufficient balance", -97500); err != nil {
		t.Fatal(err)
	}
	if w = call(a, "POST", "/api/jobs", user, "payment-flow-insufficient", in); w.Code != 402 {
		t.Fatal(w.Code, w.Body.String())
	}
	balance(0, 0)
	jobs, err := a.Store.Jobs(ctx, "user-a")
	if err != nil || len(jobs) != 2 {
		t.Fatal(len(jobs), err)
	}
}

// A suspended member cannot re-register elsewhere to recharge.
func TestSuspendedMemberCannotRegisterAgainForRecharge(t *testing.T) {
	for _, providerDisabled := range []bool{false, true} {
		a, user, _ := activationFixture(t)
		branch := newBranch(t, a, "recharge")
		p, err := a.Partners.Create(t.Context(), branch, "Provider", core.RoleS1, "recharge-provider", "admin")
		if err != nil {
			t.Fatal(err)
		}
		joinPartner(t, a, p.ID, "user-a")
		if providerDisabled {
			var value core.Partner
			if err = json.Unmarshal(p.Data, &value); err != nil {
				t.Fatal(err)
			}
			value.Status = "disabled"
			if _, err = a.Partners.Update(t.Context(), p.ID, value, p.Version, "admin"); err != nil {
				t.Fatal(err)
			}
		} else {
			membership, err := a.Store.Get(t.Context(), "memberships", "user-a")
			if err != nil {
				t.Fatal(err)
			}
			if _, err = a.Partners.ChangeMembership(t.Context(), "user-a", "disabled", "test suspension", "admin", membership.Version); err != nil {
				t.Fatal(err)
			}
		}
		other, err := a.Partners.ShareCode(t.Context(), branch, "admin")
		if err != nil {
			t.Fatal(err)
		}
		if code, body := joinHTTP(a, user, other); code != 400 {
			t.Fatal(code, body)
		}
		if w := call(a, "GET", "/api/wallet", user, "", nil); w.Code != 403 {
			t.Fatal(w.Code)
		}
	}
}
