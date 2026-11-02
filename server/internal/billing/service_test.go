package billing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func funded(t *testing.T) (*Service, context.Context) {
	t.Helper()
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	if _, e := s.Adjust(ctx, "user", "initial", "admin", "测试初始积分", 10000); e != nil {
		t.Fatal(e)
	}
	return s, ctx
}

func TestConcurrentJobReservationsNeverOverspend(t *testing.T) {
	s, ctx := funded(t)
	var wins atomic.Int32
	var group sync.WaitGroup
	for i := range 20 {
		group.Go(func() {
			j := core.NewJob("user", string(rune('a'+i)), core.JobInput{Prompt: "test"})
			j.CostUnits = 1500
			_, e := s.Store.CreateJob(ctx, j)
			if e == nil {
				wins.Add(1)
			} else if !errors.Is(e, core.ErrInsufficient) {
				t.Error(e)
			}
		})
	}
	group.Wait()
	w, _ := s.Wallet(ctx, "user")
	if wins.Load() != 6 || w.Available != 1000 || w.Held != 9000 {
		t.Fatal(w, wins.Load())
	}
}

func TestDuplicateJobAndFencedCompletionDoNotRepeatCharges(t *testing.T) {
	s, ctx := funded(t)
	j := core.NewJob("user", "same", core.JobInput{Prompt: "test"})
	j.CostUnits = 300
	for range 4 {
		if _, e := s.Store.CreateJob(ctx, j); e != nil {
			t.Fatal(e)
		}
	}
	old, _ := s.Store.Claim(ctx)
	_ = s.Store.Hold(ctx, old, -1, true)
	fresh, _ := s.Store.Claim(ctx)
	if e := s.Store.Finish(ctx, old, "wrong", ""); !errors.Is(e, core.ErrConflict) {
		t.Fatal("expired worker charged", e)
	}
	if e := s.Store.Finish(ctx, fresh, "actual", ""); e != nil {
		t.Fatal(e)
	}
	if e := s.Store.Finish(ctx, fresh, "actual", ""); !errors.Is(e, core.ErrConflict) {
		t.Fatal("repeated completion accepted")
	}
	w, _ := s.Wallet(ctx, "user")
	if w.Available != 9700 || w.Held != 0 {
		t.Fatal(w)
	}
}

func TestFailedJobReleasesFundsButAmbiguousSubmissionKeepsHold(t *testing.T) {
	for _, unknown := range []bool{false, true} {
		s, ctx := funded(t)
		j := core.NewJob("user", "failure", core.JobInput{Prompt: "test"})
		j.CostUnits = 500
		_, _ = s.Store.CreateJob(ctx, j)
		claimed, _ := s.Store.Claim(ctx)
		claimed.HoldOnFailure = unknown
		if e := s.Store.Finish(ctx, claimed, "", "failed"); e != nil {
			t.Fatal(e)
		}
		w, _ := s.Wallet(ctx, "user")
		if unknown {
			if w.Available != 9500 || w.Held != 500 {
				t.Fatal(w)
			}
		} else if w.Available != 10000 || w.Held != 0 {
			t.Fatal(w)
		}
	}
}

func TestPaymentAndRefundCallbacksAreIdempotent(t *testing.T) {
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	row, e := s.CreateOrder(ctx, "payer", "recharge-key", 500, core.DefaultPlatform(), "app", "merchant", "openid")
	if e != nil {
		t.Fatal(e)
	}
	paid := PaymentResult{OrderID: row.ID, TransactionID: "wx-transaction", AppID: "app", MerchantID: "merchant", OpenID: "openid", Currency: "CNY", AmountFen: 500, PaidAt: time.Now()}
	bad := paid
	bad.AmountFen = 1
	if e = s.Settle(ctx, bad); !errors.Is(e, core.ErrPaymentMismatch) {
		t.Fatal("wrong amount accepted", e)
	}
	var group sync.WaitGroup
	for range 20 {
		group.Go(func() {
			if e := s.Settle(ctx, paid); e != nil {
				t.Error(e)
			}
		})
	}
	group.Wait()
	w, _ := s.Wallet(ctx, "payer")
	if w.Available != 50000 {
		t.Fatal("repeated credit", w)
	}
	refund, e := s.StartRefund(ctx, row.ID, "用户申请退回积分", "admin")
	if e != nil {
		t.Fatal(e)
	}
	w, _ = s.Wallet(ctx, "payer")
	if w.Available != 0 || w.Held != 50000 {
		t.Fatal(w)
	}
	var data core.Refund
	_ = json.Unmarshal(refund.Data, &data)
	r := RefundResult{ID: refund.ID, OrderID: row.ID, ProviderID: "wx-refund", Status: "SUCCESS", AmountFen: data.AmountFen, CompletedAt: time.Now()}
	for range 20 {
		group.Go(func() {
			if e := s.FinishRefund(ctx, r); e != nil {
				t.Error(e)
			}
		})
	}
	group.Wait()
	w, _ = s.Wallet(ctx, "payer")
	if w.Available != 0 || w.Held != 0 {
		t.Fatal(w)
	}
	if e = s.Settle(ctx, paid); e != nil {
		t.Fatal(e)
	}
	w, _ = s.Wallet(ctx, "payer")
	if w.Available != 0 {
		t.Fatal("late pay callback recredited refunded order")
	}
}

func TestInsufficientRefundRollsBackOrderAndWallet(t *testing.T) {
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	row, _ := s.CreateOrder(ctx, "payer", "refund-insufficient", 500, core.DefaultPlatform(), "a", "m", "o")
	_ = s.Settle(ctx, PaymentResult{OrderID: row.ID, TransactionID: "tx", AppID: "a", MerchantID: "m", OpenID: "o", Currency: "CNY", AmountFen: 500, PaidAt: time.Now()})
	_, _ = s.Adjust(ctx, "payer", "spend", "admin", "使用积分", -1)
	if _, e := s.StartRefund(ctx, row.ID, "退款", "admin"); !errors.Is(e, core.ErrInsufficient) {
		t.Fatal(e)
	}
	current, _ := s.Store.Get(ctx, "orders", row.ID)
	var order core.Order
	_ = json.Unmarshal(current.Data, &order)
	if order.Status != "paid" || order.RefundID != "" {
		t.Fatal("failed refund modified order")
	}
}
