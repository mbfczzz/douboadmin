package billing

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"github.com/go-sql-driver/mysql"
	"os"
	"strings"
	"testing"
	"time"
)

type pausedReleaseStore struct {
	store.Store
	seen, proceed chan struct{}
}
type pausedRead struct {
	store.Transaction
	seen, proceed chan struct{}
	ctx           context.Context
	paused        bool
}

func (s *pausedReleaseStore) Atomic(ctx context.Context, fn func(store.Transaction) error) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		return fn(&pausedRead{Transaction: tx, seen: s.seen, proceed: s.proceed, ctx: ctx})
	})
}
func (tx *pausedRead) Job(id string) (core.Job, error) {
	j, e := tx.Transaction.Job(id)
	if !tx.paused {
		tx.paused = true
		close(tx.seen)
		select {
		case <-tx.proceed:
		case <-tx.ctx.Done():
			return j, tx.ctx.Err()
		}
	}
	return j, e
}

func TestMySQLReleaseRechecksStatusAfterConcurrentResume(t *testing.T) {
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
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if e = a.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	db, e := sql.Open("mysql", dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	user := "release-" + core.NewID()
	defer db.Exec(`DELETE FROM records WHERE owner_id=?`, user)
	defer db.Exec(`DELETE FROM jobs WHERE user_id=?`, user)
	service := &Service{Store: a}
	if _, e = service.Adjust(ctx, user, "fund", "admin", "test credit", 1000); e != nil {
		t.Fatal(e)
	}
	j := core.NewJob(user, "pending", core.JobInput{Kind: "mix"})
	j.CostUnits = 500
	if _, e = a.CreateJob(ctx, j); e != nil {
		t.Fatal(e)
	}
	if _, e = db.ExecContext(ctx, `UPDATE jobs SET status='failed' WHERE id=?`, j.ID); e != nil {
		t.Fatal(e)
	}
	paused := &pausedReleaseStore{Store: a, seen: make(chan struct{}), proceed: make(chan struct{})}
	result := make(chan error, 1)
	go func() { result <- (&Service{Store: paused}).ReleaseJob(ctx, j.ID, "admin", "已核实未生成") }()
	select {
	case <-paused.seen:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	resumeErr := b.Resume(ctx, j.ID)
	close(paused.proceed)
	releaseErr := <-result
	if resumeErr != nil {
		t.Fatal(resumeErr)
	}
	if !errors.Is(releaseErr, core.ErrConflict) {
		t.Fatalf("resumed job funds released: %v", releaseErr)
	}
	wallet, e := service.Wallet(ctx, user)
	if e != nil || wallet.Available != 500 || wallet.Held != 500 {
		t.Fatal(wallet, e)
	}
}
