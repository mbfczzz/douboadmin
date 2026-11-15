package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

func createFundedJob(ctx context.Context, s Store, j core.Job) (out core.Job, err error) {
	if j.CostUnits < 0 || j.CostUnits > core.MaxBalance {
		return out, fmt.Errorf("任务积分价格无效")
	}
	err = s.Atomic(ctx, func(tx Transaction) error {
		if _, _, e := LockWallet(tx, j.UserID); e != nil {
			return e
		}
		if old, e := tx.Job(j.ID); e == nil {
			if old.Hash != j.Hash {
				return core.ErrIdempotency
			}
			out = old
			return nil
		} else if !errors.Is(e, core.ErrNotFound) {
			return e
		}
		if j.ActivationRequired {
			if e := requireActiveMember(tx, j.UserID); e != nil {
				return e
			}
		}
		bill := core.JobBilling{Units: j.CostUnits, State: "free", EstimatedCostMicros: j.EstimatedCostMicros}
		if j.CostUnits > 0 {
			_, e := ApplyFunds(tx, core.LedgerEntry{UserID: j.UserID, Reference: "job:" + j.ID + ":hold", Kind: "job_hold", AvailableDelta: -j.CostUnits, HeldDelta: j.CostUnits, Note: "生成任务预留积分"})
			if e != nil {
				return e
			}
			bill.State = "reserved"
		}
		if e := tx.InsertJob(j); e != nil {
			return e
		}
		if _, e := tx.Put("job_billing", core.Record{ID: j.ID, Owner: j.UserID, Data: core.Data(bill)}, 0); e != nil {
			return e
		}
		out = j
		out.BillingState = bill.State
		return nil
	})
	return
}

func finishFundedJob(ctx context.Context, s Store, j core.Job, result, failure string) error {
	return s.Atomic(ctx, func(tx Transaction) error {
		stored, e := tx.Job(j.ID)
		if e != nil {
			return e
		}
		if _, _, e = LockWallet(tx, stored.UserID); e != nil {
			return e
		}
		if core.JobExpired(stored, time.Now()) {
			return core.ErrConflict
		}
		if e = tx.CompleteJob(j, result, failure); e != nil {
			return e
		}
		stored.HoldOnFailure = j.HoldOnFailure
		return completeJobAccounting(tx, stored, failure)
	})
}

func resumeFundedJob(ctx context.Context, s Store, id string) error {
	return s.Atomic(ctx, func(tx Transaction) error {
		j, e := tx.Job(id)
		if e != nil {
			return e
		}
		if _, _, e = LockWallet(tx, j.UserID); e != nil {
			return e
		}
		if core.JobExpired(j, time.Now()) {
			return fmt.Errorf("%w：任务已超过处理时限，请重新创作", core.ErrConflict)
		}
		row, e := tx.Get("job_billing", id)
		if e == nil {
			var bill core.JobBilling
			if e = json.Unmarshal(row.Data, &bill); e != nil {
				return e
			}
			if bill.State == "released" {
				return core.ErrConflict
			}
		}
		if e != nil && !errors.Is(e, core.ErrNotFound) {
			return e
		}
		if e = tx.ResumeJob(id); e != nil {
			return e
		}
		return resetExecutionDeadline(tx, id)
	})
}
