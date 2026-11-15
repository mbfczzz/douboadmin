package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
)

// Completion and expiration settle funds and notify in the same transaction.
func completeJobAccounting(tx Transaction, j core.Job, failure string) error {
	if err := completeLifecycle(tx, j, failure); err != nil {
		return err
	}
	row, err := tx.Get("job_billing", j.ID)
	if errors.Is(err, core.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	var bill core.JobBilling
	if err = json.Unmarshal(row.Data, &bill); err != nil {
		return err
	}
	if bill.State != "reserved" || (failure != "" && j.HoldOnFailure) {
		return nil
	}
	entry := core.LedgerEntry{UserID: j.UserID, Reference: "job:" + j.ID + ":settle", Kind: "job_charge", HeldDelta: -bill.Units, Note: "生成成功扣除积分"}
	bill.State = "charged"
	if failure != "" {
		entry.Kind, entry.AvailableDelta, entry.Note = "job_release", bill.Units, "生成失败退回积分"
		bill.State = "released"
	}
	if _, err = ApplyFunds(tx, entry); err != nil {
		return err
	}
	row.Data = core.Data(bill)
	_, err = tx.Put("job_billing", row, row.Version)
	return err
}
