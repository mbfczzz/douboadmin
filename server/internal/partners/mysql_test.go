package partners_test

import (
	"context"
	"database/sql"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-sql-driver/mysql"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func sqlFixture(t *testing.T) (*store.MySQL, *store.MySQL, context.Context) {
	t.Helper()
	dsn := os.Getenv("PARTNERS_MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("PARTNERS_MYSQL_TEST_DSN required")
	}
	cfg, e := mysql.ParseDSN(dsn)
	if e != nil || cfg.DBName != "doubo_partners_test" {
		t.Fatal("use the isolated doubo_partners_test database")
	}
	a, e := store.NewMySQL(dsn)
	if e != nil {
		t.Fatal(e)
	}
	b, e := store.NewMySQL(dsn)
	if e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	if e = a.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	db, e := sql.Open("mysql", dsn)
	if e != nil {
		t.Fatal(e)
	}
	clean := func() {
		if _, e := db.Exec(`DELETE FROM jobs`); e != nil {
			t.Error(e)
		}
		if _, e := db.Exec(`DELETE FROM records`); e != nil {
			t.Error(e)
		}
	}
	clean()
	t.Cleanup(func() { clean(); db.Close(); a.Close(); b.Close(); cancel() })
	return a, b, ctx
}
func makePartner(t *testing.T, p *partners.Service, ctx context.Context) string {
	t.Helper()
	r, e := p.Create(ctx, core.RootPartner, "S1", "mysql-create-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	_, e = p.Transfer(ctx, core.QuotaMove{ParentID: core.RootPartner, ChildID: r.ID, Users: 1, Partners: 1, Kind: "grant", Reason: "测试划拨"}, "mysql-grant-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	return r.ID
}
func TestMySQLIndependentInstancesReserveAndRedeemOnlyOnce(t *testing.T) {
	a, b, ctx := sqlFixture(t)
	one, two := &partners.Service{Store: a}, &partners.Service{Store: b}
	id := makePartner(t, one, ctx)
	var wins atomic.Int32
	var wg sync.WaitGroup
	codes := make(chan core.Record, 20)
	for i := range 20 {
		p := one
		if i%2 == 1 {
			p = two
		}
		wg.Go(func() {
			r, e := p.Issue(ctx, id, "last slot", 7, fmt.Sprintf("mysql-code-%02d", i), "admin")
			if e == nil {
				wins.Add(1)
				codes <- r
			} else if !errors.Is(e, core.ErrQuota) {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	close(codes)
	if wins.Load() != 1 {
		t.Fatal("reserved more than one slot", wins.Load())
	}
	code := <-codes
	token, e := one.Reveal(ctx, code.ID)
	if e != nil {
		t.Fatal(e)
	}
	for _, user := range []string{"user-a", "user-b"} {
		_, e = a.Put(ctx, "users", core.Record{ID: user, Owner: user, Data: core.Data(map[string]string{"nickname": user})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	wins.Store(0)
	for i, user := range []string{"user-a", "user-b"} {
		p := one
		if i == 1 {
			p = two
		}
		wg.Go(func() {
			if result, e := p.Redeem(ctx, user, token); e == nil && result.Active {
				wins.Add(1)
			}
		})
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatal("activation duplicated", wins.Load())
	}
	view, e := two.Overview(ctx, id)
	if e != nil || view.Quota.Users.Used != 1 || view.Quota.Users.Reserved != 0 || view.Quota.Users.Available() != 0 {
		t.Fatal(view.Quota, e)
	}
	_, e = one.Transfer(ctx, core.QuotaMove{ParentID: core.RootPartner, ChildID: id, Users: 1, Kind: "grant", Reason: "测试过期释放"}, "mysql-expire-slot", "admin")
	if e != nil {
		t.Fatal(e)
	}
	expiring, e := one.Issue(ctx, id, "expiry", 1, "mysql-expire-code", "admin")
	if e != nil {
		t.Fatal(e)
	}
	var v core.ActivationCode
	_ = json.Unmarshal(expiring.Data, &v)
	v.ExpiresAt = time.Now().Add(-time.Minute)
	v.ExpiresUnix = v.ExpiresAt.Unix()
	expiring.Data = core.Data(v)
	if _, e = a.Put(ctx, "activation_codes", expiring, expiring.Version); e != nil {
		t.Fatal(e)
	}
	for _, service := range []*partners.Service{one, two} {
		wg.Go(func() {
			if e := service.Expire(ctx); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	view, e = two.Overview(ctx, id)
	if e != nil || view.Quota.Users.Reserved != 0 || view.Quota.Users.Available() != 1 {
		t.Fatal(view.Quota, e)
	}
}
func TestMySQLCommissionsAndRefundsAreAtomicAcrossInstances(t *testing.T) {
	a, b, ctx := sqlFixture(t)
	p := &partners.Service{Store: a}
	s1 := makePartner(t, p, ctx)
	s2, e := p.Create(ctx, s1, "S2", "mysql-create-s2", "admin")
	if e != nil {
		t.Fatal(e)
	}
	_, e = p.Transfer(ctx, core.QuotaMove{ParentID: s1, ChildID: s2.ID, Users: 1, Kind: "grant", Reason: "向下划拨"}, "mysql-grant-s2", "admin")
	if e != nil {
		t.Fatal(e)
	}
	policy := core.DefaultDistributionPolicy()
	policy.Enabled = true
	if _, e = p.SavePolicy(ctx, policy, 0, "admin"); e != nil {
		t.Fatal(e)
	}
	_, e = a.Put(ctx, "users", core.Record{ID: "payer", Owner: "payer", Data: core.Data(map[string]string{"nickname": "payer"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	code, e := p.Issue(ctx, s2.ID, "payer", 7, "mysql-payer-code", "admin")
	if e != nil {
		t.Fatal(e)
	}
	token, _ := p.Reveal(ctx, code.ID)
	if _, e = p.Redeem(ctx, "payer", token); e != nil {
		t.Fatal(e)
	}
	quote, _, e := p.UserQuote(ctx, "payer", 10000, 100)
	if e != nil {
		t.Fatal(e)
	}
	one, two := &billing.Service{Store: a, RequireActivation: true}, &billing.Service{Store: b, RequireActivation: true}
	order, e := one.CreateOrder(ctx, "payer", "mysql-channel-order", 10000, core.DefaultPlatform(), "app", "merchant", "openid", quote.PricingVersion)
	if e != nil {
		t.Fatal(e)
	}
	paid := billing.PaymentResult{OrderID: order.ID, TransactionID: "mysql-transaction", AppID: "app", MerchantID: "merchant", OpenID: "openid", Currency: "CNY", AmountFen: 10000, PaidAt: time.Now()}
	var wg sync.WaitGroup
	for i := range 16 {
		s := one
		if i%2 == 1 {
			s = two
		}
		wg.Go(func() {
			if e := s.Settle(ctx, paid); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	for id, want := range map[string]int64{core.RootPartner: 1000, s1: 500, s2.ID: 500} {
		view, e := p.Overview(ctx, id)
		if e != nil || view.Commission.BalanceFen != want {
			t.Fatal(id, view.Commission, e)
		}
	}
	refund, e := one.StartRefund(ctx, order.ID, "测试退款", "admin")
	if e != nil {
		t.Fatal(e)
	}
	r := billing.RefundResult{ID: refund.ID, OrderID: order.ID, ProviderID: "mysql-refund", Status: "SUCCESS", AmountFen: 10000, CompletedAt: time.Now()}
	for i := range 16 {
		s := one
		if i%2 == 1 {
			s = two
		}
		wg.Go(func() {
			if e := s.FinishRefund(ctx, r); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	for _, id := range []string{core.RootPartner, s1, s2.ID} {
		view, e := p.Overview(ctx, id)
		if e != nil || view.Commission.BalanceFen != 0 || view.Commission.HeldFen != 0 {
			t.Fatal(id, view.Commission, e)
		}
	}
	w, e := two.Wallet(ctx, "payer")
	if e != nil || w.Available != 0 || w.Held != 0 {
		t.Fatal(w, e)
	}
}
