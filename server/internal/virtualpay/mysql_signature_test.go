package virtualpay

import (
	"database/sql"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
)

func TestMySQLVirtualSignatureOnceAndSnapshotSettlement(t *testing.T) {
	dsn := os.Getenv("MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEST_DSN required for real MySQL payment tests")
	}
	parsed, err := mysql.ParseDSN(dsn)
	if err != nil || !strings.Contains(parsed.DBName, "_test") {
		t.Fatal("use an isolated _test database")
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	user := "signature-" + core.NewID()
	a, err := store.NewMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := store.NewMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	ctx := t.Context()
	if err = a.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	defer db.Exec(`DELETE FROM records WHERE owner_id=?`, user)
	cfg := testConfig()
	cfg.Env = 0
	cfg.Products[0].AmountFen, cfg.Products[0].PointsUnits = 10, 1000000
	client, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	one, two := &billing.Service{Store: a}, &billing.Service{Store: b}
	goods, fen, err := cfg.Products[0].Purchase(1, 0, "android", "package")
	if err != nil {
		t.Fatal(err)
	}
	row, err := one.CreateVirtualOrder(ctx, user, "mysql-signature", fen, core.DefaultPlatform(), cfg.AppID, cfg.OfferID, "openid", "", goods)
	if err != nil {
		t.Fatal(err)
	}
	var order core.Order
	if err = json.Unmarshal(row.Data, &order); err != nil {
		t.Fatal(err)
	}
	if _, err = client.Parameters(row.ID, order, "fixture-session-key"); err != nil {
		t.Fatal(err)
	}
	services := []*Service{{Store: a, Billing: one, Client: client}, {Store: b, Billing: two, Client: client}}
	var winners atomic.Int32
	var wg sync.WaitGroup
	for i := range 16 {
		s := services[i%2]
		wg.Go(func() {
			if err := s.ClaimSignature(ctx, row.ID); err == nil {
				winners.Add(1)
			} else if !errors.Is(err, core.ErrConflict) {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	if winners.Load() != 1 {
		t.Fatal("expected exactly one successful payment signature", winners.Load())
	}
	stored, err := a.Get(ctx, "orders", row.ID)
	if err != nil || json.Unmarshal(stored.Data, &order) != nil || !order.Virtual.Issued || order.AmountFen != 10 || order.PointsUnits != 1000000 {
		t.Fatal("signing changed the package snapshot", err)
	}
	wallet, err := one.Wallet(ctx, user)
	if err != nil || wallet.Available != 0 {
		t.Fatal("signing credited an unpaid order", wallet, err)
	}
	paid := billing.PaymentResult{Channel: Channel, OrderID: row.ID, TransactionID: "tx-" + core.NewID(), AppID: cfg.AppID,
		MerchantID: cfg.OfferID, OpenID: "openid", Currency: "CNY", AmountFen: 10, PaidAt: time.Now()}
	for range 2 {
		if err = one.Settle(ctx, paid); err != nil {
			t.Fatal(err)
		}
	}
	wallet, err = two.Wallet(ctx, user)
	if err != nil || wallet.Available != 1000000 {
		t.Fatal("duplicate callback changed package credit", wallet, err)
	}
	refund, err := one.StartRefund(ctx, row.ID, "测试套餐退款", "admin")
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err = two.FinishRefund(ctx, billing.RefundResult{Channel: Channel, ID: refund.ID, OrderID: row.ID,
			ProviderID: "refund-" + row.ID, Status: "SUCCESS", AmountFen: 10, CompletedAt: time.Now()}); err != nil {
			t.Fatal(err)
		}
	}
	wallet, err = one.Wallet(ctx, user)
	if err != nil || wallet.Available != 0 || wallet.Held != 0 {
		t.Fatal("refund did not reverse the package snapshot exactly once", wallet, err)
	}
}
