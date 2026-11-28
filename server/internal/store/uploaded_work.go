package store

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
)

// CreateUploadedWork stores uploaded media as a finished work with a free
// billing record, so lists show 0 consumed points and nothing is ever held.
func CreateUploadedWork(ctx context.Context, s AtomicStore, j core.Job) error {
	if !j.Input.Uploaded() || (j.Input.Kind != "video" && j.Input.Kind != "image") || j.Result == "" {
		return fmt.Errorf("uploaded work is invalid")
	}
	return s.Atomic(ctx, func(tx Transaction) error {
		if e := tx.InsertFinishedJob(j); e != nil {
			return e
		}
		_, e := tx.Put("job_billing", core.Record{ID: j.ID, Owner: j.UserID, Data: core.Data(core.JobBilling{State: "free"})}, 0)
		return e
	})
}
