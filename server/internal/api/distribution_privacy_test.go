package api

import (
	"context"
	"doubo/server/internal/core"
	"strings"
	"testing"
)

func TestOrderDistributionIsAdminOnlyAndHiddenFromUserOrder(t *testing.T) {
	a, user, admin := activationFixture(t)
	ctx := context.Background()
	code, e := a.Partners.Issue(ctx, core.RootPartner, "test", 7, "privacy-grant", "admin")
	if e != nil {
		t.Fatal(e)
	}
	token, _ := a.Partners.Reveal(ctx, code.ID)
	if _, e = a.Partners.Redeem(ctx, "user-a", token); e != nil {
		t.Fatal(e)
	}
	policy := core.DefaultDistributionPolicy()
	policy.Enabled = true
	if _, e = a.Partners.SavePolicy(ctx, policy, 0, "admin"); e != nil {
		t.Fatal(e)
	}
	quote, _, e := a.Partners.UserQuote(ctx, "user-a", 10000, 100)
	if e != nil {
		t.Fatal(e)
	}
	order, e := a.Billing.CreateOrder(ctx, "user-a", "private-order", 10000, core.DefaultPlatform(), "app", "merchant", "private-openid", quote.PricingVersion)
	if e != nil {
		t.Fatal(e)
	}
	w := call(a, "GET", "/api/orders/"+order.ID, user, "", nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), "costFen") || strings.Contains(w.Body.String(), "private-openid") || strings.Contains(w.Body.String(), "shares") {
		t.Fatal(w.Code, w.Body.String())
	}
	path := "/api/admin/orders/" + order.ID + "/distribution"
	if w = call(a, "GET", path, user, "", nil); w.Code != 403 {
		t.Fatal("user read upstream margins", w.Code)
	}
	if w = call(a, "GET", path, admin, "", nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"costFen":8000`) || strings.Contains(w.Body.String(), "private-openid") {
		t.Fatal(w.Code, w.Body.String())
	}
}
