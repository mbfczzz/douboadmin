package billing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
)

func (s *Service) ReleaseJob(ctx context.Context, id, actor, reason string) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		j, e := tx.Job(id)
		if e != nil {
			return e
		}
		if _, _, e = store.LockWallet(tx, j.UserID); e != nil {
			return e
		}
		// Resume and release share this lock; the pre-lock status can already be stale.
		j, e = tx.Job(id)
		if e != nil {
			return e
		}
		if j.Status != "failed" {
			return fmt.Errorf("%w: 仅可处理已停止的异常任务", core.ErrConflict)
		}
		row, e := tx.Get("job_billing", id)
		if e != nil {
			return e
		}
		var bill core.JobBilling
		if e = json.Unmarshal(row.Data, &bill); e != nil {
			return e
		}
		if bill.State == "released" {
			return nil
		}
		if bill.State != "reserved" {
			return core.ErrConflict
		}
		_, e = store.ApplyFunds(tx, core.LedgerEntry{UserID: j.UserID, Reference: "job:" + id + ":manual-release", Kind: "job_release", AvailableDelta: bill.Units, HeldDelta: -bill.Units, Actor: actor, Note: reason})
		if e != nil {
			return e
		}
		bill.State = "released"
		row.Data = core.Data(bill)
		if _, e = tx.Put("job_billing", row, row.Version); e != nil {
			return e
		}
		return store.NotifyOnce(tx, j.UserID, "manual-release:"+id, core.Notification{Kind: "job", Title: "任务预留积分已退回", Content: reason, TargetID: id})
	})
}
