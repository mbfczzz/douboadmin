package api

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestPaymentRecordsRequireAdminAndConfirmedReceipt(t *testing.T) {
	a, user, _ := setup(t)
	ctx := context.Background()
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	order, e := a.Billing.CreateOrder(ctx, "user-a", "payment-record", 200, core.DefaultPlatform(), "app", "merchant", "private-openid")
	if e != nil {
		t.Fatal(e)
	}
	if w := call(a, "GET", "/api/admin/payments", user, "", nil); w.Code != 403 {
		t.Fatal(w.Code)
	}
	if w := call(a, "GET", "/api/admin/payments", "", "", nil); w.Code != 401 {
		t.Fatal(w.Code)
	}
	page := func(path string) core.PaymentPage {
		w := call(a, "GET", path, admin, "", nil)
		var p core.PaymentPage
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &p) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "private-openid") || strings.Contains(w.Body.String(), "prepay") {
			t.Fatal("private payment details exposed")
		}
		return p
	}
	if p := page("/api/admin/payments"); p.Total != 0 {
		t.Fatal("unpaid order shown as receipt")
	}
	paid := billing.PaymentResult{OrderID: order.ID, TransactionID: "wx-confirmed", AppID: "app", MerchantID: "merchant", OpenID: "private-openid", Currency: "CNY", AmountFen: 200, PaidAt: time.Now()}
	for range 2 {
		if e = a.Billing.Settle(ctx, paid); e != nil {
			t.Fatal(e)
		}
	}
	today := time.Now().In(time.FixedZone("CST", 8*60*60)).Format("2006-01-02")
	p := page("/api/admin/payments?from=" + today + "&to=" + today + "&q=wx-confirmed")
	if p.Total != 1 || p.Items[0].OrderID != order.ID || p.Items[0].PointsUnits != 20000 {
		t.Fatal(p)
	}
	if _, e = a.Billing.StartRefund(ctx, order.ID, "test refund", "admin"); e != nil {
		t.Fatal(e)
	}
	if p = page("/api/admin/payments?status=refunding"); p.Total != 1 || p.Items[0].RefundID == "" {
		t.Fatal(p)
	}
	for _, q := range []string{"page=0", "page=invalid", "status=created", "from=2026-02-30", "from=2026-11-02&to=2026-11-01"} {
		if w := call(a, "GET", "/api/admin/payments?"+q, admin, "", nil); w.Code != 400 {
			t.Fatal(q, w.Code)
		}
	}
}
