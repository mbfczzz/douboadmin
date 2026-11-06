package billing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

func channelFixture(t *testing.T) (*Service, *partners.Service, context.Context, string, string) {
	t.Helper()
	db := store.NewMemory()
	s := &Service{Store: db, RequireActivation: true}
	p := &partners.Service{Store: db}
	ctx := context.Background()
	policy := core.DefaultDistributionPolicy()
	policy.Enabled = true
	if _, e := p.SavePolicy(ctx, policy, 0, "admin"); e != nil {
		t.Fatal(e)
	}
	a, e := p.Create(ctx, core.RootPartner, "S1", 9, "create-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	b, e := p.Create(ctx, a.ID, "S2", 1, "create-s2", "admin")
	if e != nil {
		t.Fatal(e)
	}
	_, _ = db.Put(ctx, "users", core.Record{ID: "user", Data: core.Data(map[string]string{"nickname": "test"})}, 0)
	code, e := p.Issue(ctx, b.ID, "user", 7, "code-user", "admin")
	if e != nil {
		t.Fatal(e)
	}
	token, _ := p.Reveal(ctx, code.ID)
	if _, e = p.Redeem(ctx, "user", token); e != nil {
		t.Fatal(e)
	}
	return s, p, ctx, a.ID, b.ID
}
func TestCommissionExampleSnapshotDuplicatePaymentAndRefund(t *testing.T) {
	s, p, ctx, s1, s2 := channelFixture(t)
	quote, units, e := p.UserQuote(ctx, "user", 10000, 100)
	if e != nil || units != 1000000 {
		t.Fatal(quote, units, e)
	}
	if quote.CostFen != 8000 || len(quote.Shares) != 3 || quote.Shares[0].AmountFen != 1000 || quote.Shares[1].AmountFen != 500 || quote.Shares[2].AmountFen != 500 {
		t.Fatal(quote)
	}
	order, e := s.CreateOrder(ctx, "user", "order-channel", 10000, core.DefaultPlatform(), "app", "merchant", "openid", quote.PricingVersion)
	if e != nil {
		t.Fatal(e)
	}
	node, e := p.Overview(ctx, s2)
	if e != nil {
		t.Fatal(e)
	}
	var v core.Partner
	_ = json.Unmarshal(node.Record.Data, &v)
	v.RetailPer100Fen = 11000
	if _, e = p.Update(ctx, s2, v, node.Record.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	paid := PaymentResult{OrderID: order.ID, TransactionID: "wechat-test", AppID: "app", MerchantID: "merchant", OpenID: "openid", Currency: "CNY", AmountFen: 10000, PaidAt: time.Now()}
	var wg sync.WaitGroup
	for range 16 {
		wg.Go(func() {
			if e := s.Settle(ctx, paid); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	for id, want := range map[string]int64{core.RootPartner: 1000, s1: 500, s2: 500} {
		view, e := p.Overview(ctx, id)
		if e != nil || view.Commission.BalanceFen != want {
			t.Fatal(id, view.Commission, e)
		}
	}
	payout, e := p.RequestPayout(ctx, s2, 500, "测试提现", "payout-test", "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = p.FinishPayout(ctx, payout.ID, "paid", "银行流水测试", "admin", payout.Version); e != nil {
		t.Fatal(e)
	}
	refund, e := s.StartRefund(ctx, order.ID, "申请退款", "admin")
	if e != nil {
		t.Fatal(e)
	}
	result := RefundResult{ID: refund.ID, OrderID: order.ID, ProviderID: "refund-test", Status: "SUCCESS", AmountFen: 10000, CompletedAt: time.Now()}
	for range 8 {
		wg.Go(func() {
			if e := s.FinishRefund(ctx, result); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	view, _ := p.Overview(ctx, s2)
	if view.Commission.BalanceFen != -500 || view.Commission.PaidOutFen != 500 || view.Commission.HeldFen != 0 {
		t.Fatal(view.Commission)
	}
	if _, e = p.RequestPayout(ctx, s2, 1, "再次提现", "payout-again", "admin"); e == nil {
		t.Fatal("negative balance paid out")
	}
	for _, id := range []string{core.RootPartner, s1} {
		view, _ := p.Overview(ctx, id)
		if view.Commission.BalanceFen != 0 || view.Commission.HeldFen != 0 {
			t.Fatal(id, view.Commission)
		}
	}
}
func TestDirectChildProfitAndBelowCostPricing(t *testing.T) {
	_, p, ctx, s1, s2 := channelFixture(t)
	price, e := p.Price(ctx, s1)
	if e != nil || price.IncomingPer100Fen != 9000 || price.Shares[len(price.Shares)-1].AmountFen != 1000 {
		t.Fatal(price, e)
	}
	view, _ := p.Overview(ctx, s2)
	var v core.Partner
	_ = json.Unmarshal(view.Record.Data, &v)
	v.RetailPer100Fen = 9400
	if _, e = p.Update(ctx, s2, v, view.Record.Version, "admin"); e == nil {
		t.Fatal("below-cost sale accepted")
	}
}

func TestSmallRechargeRoundingConservesCashAndDoesNotUnderstateCost(t *testing.T) {
	_, p, ctx, _, _ := channelFixture(t)
	for fen := int64(1); fen < 103; fen++ {
		q, _, e := p.UserQuote(ctx, "user", fen, 100)
		if e != nil {
			t.Fatal(e)
		}
		sum := q.CostFen
		for _, v := range q.Shares {
			if v.AmountFen < 0 {
				t.Fatal("negative commission")
			}
			sum += v.AmountFen
		}
		if sum != fen || q.CostFen*10000 < fen*8000 {
			t.Fatal("rounding error", fen, q)
		}
	}
}

func TestClosedRefundRestoresCommissionAndNewRefundCanReverseIt(t *testing.T) {
	s, p, ctx, s1, s2 := channelFixture(t)
	q, _, e := p.UserQuote(ctx, "user", 10000, 100)
	if e != nil {
		t.Fatal(e)
	}
	order, e := s.CreateOrder(ctx, "user", "refund-close-order", 10000, core.DefaultPlatform(), "app", "merchant", "openid", q.PricingVersion)
	if e != nil {
		t.Fatal(e)
	}
	paid := PaymentResult{OrderID: order.ID, TransactionID: "closed-refund-pay", AppID: "app", MerchantID: "merchant", OpenID: "openid", Currency: "CNY", AmountFen: 10000, PaidAt: time.Now()}
	if e = s.Settle(ctx, paid); e != nil {
		t.Fatal(e)
	}
	refund, e := s.StartRefund(ctx, order.ID, "第一次退款", "admin")
	if e != nil {
		t.Fatal(e)
	}
	closed := RefundResult{ID: refund.ID, OrderID: order.ID, ProviderID: "closed-refund", Status: "CLOSED", AmountFen: 10000, CompletedAt: time.Now()}
	if e = s.FinishRefund(ctx, closed); e != nil {
		t.Fatal(e)
	}
	for id, want := range map[string]int64{core.RootPartner: 1000, s1: 500, s2: 500} {
		view, e := p.Overview(ctx, id)
		if e != nil || view.Commission.BalanceFen != want || view.Commission.HeldFen != 0 {
			t.Fatal(view.Commission, e)
		}
	}
	next, e := s.StartRefund(ctx, order.ID, "再次退款", "admin")
	if e != nil || next.ID == refund.ID {
		t.Fatal(e)
	}
	if e = s.FinishRefund(ctx, RefundResult{ID: next.ID, OrderID: order.ID, ProviderID: "success-refund", Status: "SUCCESS", AmountFen: 10000, CompletedAt: time.Now()}); e != nil {
		t.Fatal(e)
	}
	if e = s.FinishRefund(ctx, closed); e != nil {
		t.Fatal(e)
	}
	if e = s.Settle(ctx, paid); e != nil {
		t.Fatal(e)
	}
	for _, id := range []string{core.RootPartner, s1, s2} {
		view, _ := p.Overview(ctx, id)
		if view.Commission.BalanceFen != 0 || view.Commission.HeldFen != 0 {
			t.Fatal(view.Commission)
		}
	}
}
func TestChangedPartnerPriceRequiresAnotherUserConfirmation(t *testing.T) {
	s, p, ctx, _, s2 := channelFixture(t)
	quote, _, _ := p.UserQuote(ctx, "user", 10000, 100)
	view, _ := p.Overview(ctx, s2)
	var node core.Partner
	_ = json.Unmarshal(view.Record.Data, &node)
	node.RetailPer100Fen = 11000
	if _, e := p.Update(ctx, s2, node, view.Record.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	_, e := s.CreateOrder(ctx, "user", "stale-price-order", 10000, core.DefaultPlatform(), "app", "merchant", "openid", quote.PricingVersion)
	if !errors.Is(e, core.ErrConflict) {
		t.Fatal("stale price consent accepted", e)
	}
	rows, _ := s.Store.List(ctx, "orders", "user")
	if len(rows) != 0 {
		t.Fatal("stale quote created an order")
	}
}
