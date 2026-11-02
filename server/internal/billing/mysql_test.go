package billing

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
)

func TestMySQLPaymentAndConcurrentGenerationAcrossInstances(t *testing.T) {
	dsn := os.Getenv("MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEST_DSN required")
	}
	cfg, e := mysql.ParseDSN(dsn)
	if e != nil || !strings.Contains(cfg.DBName, "_test") {
		t.Fatal("dedicated test database required")
	}
	a, e := store.NewMySQL(dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer a.Close()
	b, e := store.NewMySQL(dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer b.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if e = a.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	user := "financial-" + core.NewID()
	db, e := sql.Open("mysql", dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	defer db.Exec(`DELETE FROM records WHERE owner_id=?`, user)
	defer db.Exec(`DELETE FROM jobs WHERE user_id=?`, user)
	one, two := &Service{Store: a}, &Service{Store: b}
	row, e := one.CreateOrder(ctx, user, "recharge", 500, core.DefaultPlatform(), "app", "merchant", "openid")
	if e != nil {
		t.Fatal(e)
	}
	paid := PaymentResult{OrderID: row.ID, TransactionID: "tx-" + core.NewID(), AppID: "app", MerchantID: "merchant", OpenID: "openid", Currency: "CNY", AmountFen: 500, PaidAt: time.Now().UTC()}
	var wg sync.WaitGroup
	for i := range 24 {
		service := one
		if i%2 == 1 {
			service = two
		}
		wg.Go(func() {
			if e := service.Settle(ctx, paid); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	w, e := one.Wallet(ctx, user)
	if e != nil || w.Available != 50000 {
		t.Fatal("duplicate notification credited twice", w, e)
	}
	var accepted atomic.Int32
	for i := range 20 {
		service := a
		if i%2 == 1 {
			service = b
		}
		wg.Go(func() {
			j := core.NewJob(user, string(rune('a'+i)), core.JobInput{Kind: "image", Prompt: "test"})
			j.CostUnits = 15000
			_, e := service.CreateJob(ctx, j)
			if e == nil {
				accepted.Add(1)
			} else if !errors.Is(e, core.ErrInsufficient) {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	w, e = two.Wallet(ctx, user)
	if e != nil || accepted.Load() != 3 || w.Available != 5000 || w.Held != 45000 {
		t.Fatal("reservation overspent", accepted.Load(), w, e)
	}
}
