package billing

import (
	"doubo/server/internal/core"
	"errors"
	"testing"
	"time"
)

func TestMultipleVirtualPurchaseCommissionsUseFullAmountAndRefundOnce(t *testing.T) {
	s, partners, ctx, s1, s2 := channelFixture(t)
	quote, err := partners.UserPurchaseQuote(ctx, "user", 10000)
	units := int64(987654321)
	if err != nil {
		t.Fatal(err)
	}
	goods := core.VirtualOrder{ProductID: "base", Quantity: 10, UnitFen: 1000, PointsUnits: units, Env: 0}
	legacy := core.PlatformSettings{PointsPerYuan: 0, MinRechargeFen: 100000, MaxRechargeFen: 1}
	row, err := s.CreateVirtualOrder(ctx, "user", "quantity-commission", 10000, legacy, "app", "offer", "openid", quote.PricingVersion, goods)
	if err != nil {
		t.Fatal(err)
	}
	alternative := goods
	alternative.Quantity, alternative.UnitFen = 20, 500
	if _, err = s.CreateVirtualOrder(ctx, "user", "quantity-commission", 10000, core.DefaultPlatform(), "app", "offer", "openid", quote.PricingVersion, alternative); !errors.Is(err, core.ErrIdempotency) {
		t.Fatal("a different quantity/price reused an existing order", err)
	}
	paid := PaymentResult{Channel: "wechat_virtual", OrderID: row.ID, TransactionID: "multiple-commission-payment",
		AppID: "app", MerchantID: "offer", OpenID: "openid", Currency: "CNY", AmountFen: 10000, PaidAt: time.Now()}
	for range 2 {
		if err = s.Settle(ctx, paid); err != nil {
			t.Fatal(err)
		}
	}
	for id, want := range map[string]int64{core.RootPartner: 1000, s1: 500, s2: 500} {
		view, err := partners.Overview(ctx, id)
		if err != nil || view.Commission.BalanceFen != want {
			t.Fatal(id, view.Commission, err)
		}
	}
	wallet, _ := s.Wallet(ctx, "user")
	if wallet.Available != units {
		t.Fatal(wallet, units)
	}
	refund, err := s.StartRefund(ctx, row.ID, "测试多份订单退款", "admin")
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err = s.FinishRefund(ctx, RefundResult{Channel: "wechat_virtual", ID: refund.ID, OrderID: row.ID,
			ProviderID: "quantity-refund", Status: "SUCCESS", AmountFen: 10000, CompletedAt: time.Now()}); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{core.RootPartner, s1, s2} {
		view, _ := partners.Overview(ctx, id)
		if view.Commission.BalanceFen != 0 || view.Commission.HeldFen != 0 {
			t.Fatal(id, view.Commission)
		}
	}
	wallet, _ = s.Wallet(ctx, "user")
	if wallet.Available != 0 || wallet.Held != 0 {
		t.Fatal(wallet)
	}
}
