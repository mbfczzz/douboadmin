package partners_test

import (
	"context"
	"database/sql"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"fmt"
	"github.com/go-sql-driver/mysql"
	"os"
	"strings"
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
		for _, table := range store.Tables() {
			if _, e := db.Exec("DELETE FROM `" + table.Name + "`"); e != nil {
				t.Error(e)
			}
		}
	}
	clean()
	t.Cleanup(func() { clean(); db.Close(); a.Close(); b.Close(); cancel() })
	return a, b, ctx
}
func makeBranch(t *testing.T, p *partners.Service, ctx context.Context) string {
	t.Helper()
	r, e := p.Create(ctx, core.RootPartner, "分公司", core.RoleBranch, "mysql-create-branch", "admin")
	if e != nil {
		t.Fatal(e)
	}
	return r.ID
}

// makePartner creates an S1 under a new 分公司.
func makePartner(t *testing.T, p *partners.Service, ctx context.Context) string {
	t.Helper()
	r, e := p.Create(ctx, makeBranch(t, p, ctx), "S1", core.RoleS1, "mysql-create-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	return r.ID
}
func addUser(t *testing.T, a *store.MySQL, ctx context.Context, id string) {
	t.Helper()
	if _, e := a.Put(ctx, "users", core.Record{ID: id, Owner: id, Data: core.Data(map[string]string{"nickname": id, "name": id})}, 0); e != nil {
		t.Fatal(e)
	}
}

// joinSQL registers a user with the member code and approves them.
func joinSQL(t *testing.T, p *partners.Service, ctx context.Context, partner, user string) {
	t.Helper()
	code, e := p.ShareCode(ctx, partner, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if access, e := p.Join(ctx, user, code, "scan"); e != nil || access.Status != "review" {
		t.Fatal(access, e)
	}
	row, e := p.Store.Get(ctx, "registrations", user)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = p.Decide(ctx, user, true, "", row.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	if access, e := p.Access(ctx, user); e != nil || !access.Active {
		t.Fatal(access, e)
	}
}

// race runs fn for every user, alternating between the two instances.
func race(users []string, one, two *partners.Service, fn func(*partners.Service, string)) {
	var wg sync.WaitGroup
	for i, user := range users {
		p := one
		if i%2 == 1 {
			p = two
		}
		wg.Go(func() { fn(p, user) })
	}
	wg.Wait()
}
func TestMySQLIndependentInstancesShareOneCodeAndBindOnce(t *testing.T) {
	a, b, ctx := sqlFixture(t)
	one, two := &partners.Service{Store: a}, &partners.Service{Store: b}
	id := makePartner(t, one, ctx)
	codes := make(chan string, 8)
	race(make([]string, 8), one, two, func(p *partners.Service, _ string) {
		code, e := p.ShareCode(ctx, id, "admin")
		if e != nil {
			t.Error(e)
		}
		codes <- code
	})
	close(codes)
	code := <-codes
	for other := range codes {
		if other != code {
			t.Fatal("concurrent share codes differ", code, other)
		}
	}
	users := make([]string, 10)
	for i := range users {
		users[i] = fmt.Sprintf("user-%02d", i)
		addUser(t, a, ctx, users[i])
	}
	// The member code has no seat limit: everyone registers once, pending.
	var registered atomic.Int32
	race(users, one, two, func(p *partners.Service, user string) {
		if result, e := p.Join(ctx, user, code, "scan"); e == nil && result.Status == "review" {
			registered.Add(1)
		}
	})
	if registered.Load() != int32(len(users)) {
		t.Fatal("registrations", registered.Load())
	}
	// A bind code links exactly one account.
	bind, e := one.Share(ctx, id, partners.BindCode, "admin")
	if e != nil {
		t.Fatal(e)
	}
	bosses := []string{"boss-0", "boss-1", "boss-2", "boss-3", "boss-4", "boss-5"}
	for _, user := range bosses {
		addUser(t, a, ctx, user)
	}
	var wins atomic.Int32
	race(bosses, one, two, func(p *partners.Service, user string) {
		if _, e := p.Join(ctx, user, bind.Code, "scan"); e == nil {
			wins.Add(1)
		}
	})
	if v, _ := two.Share(ctx, id, partners.BindCode, "admin"); wins.Load() != 1 || v.User == "" {
		t.Fatal("bind code used more than once", wins.Load(), v)
	}
	fresh, e := two.ResetShare(ctx, id, partners.MemberCode, "admin")
	if e != nil || fresh.Code == code {
		t.Fatal(fresh, e)
	}
	addUser(t, a, ctx, "late")
	if _, e = one.Join(ctx, "late", code, "scan"); e == nil || !strings.Contains(e.Error(), "已重置") {
		t.Fatal("reset code still joins", e)
	}
}
func TestMySQLCommissionsAndRefundsAreAtomicAcrossInstances(t *testing.T) {
	a, b, ctx := sqlFixture(t)
	p := &partners.Service{Store: a}
	// Same shape as the in-memory commission example: 分公司 → S1 → payer.
	branch := makeBranch(t, p, ctx)
	s1, e := p.Create(ctx, branch, "S1", core.RoleS1, "mysql-create-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	policy := core.DefaultDistributionPolicy()
	policy.Enabled = true
	if _, e = p.SavePolicy(ctx, policy, 0, "admin"); e != nil {
		t.Fatal(e)
	}
	addUser(t, a, ctx, "payer")
	joinSQL(t, p, ctx, s1.ID, "payer")
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
	for id, want := range map[string]int64{core.RootPartner: 1000, branch: 500, s1.ID: 500} {
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
	for _, id := range []string{core.RootPartner, branch, s1.ID} {
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
