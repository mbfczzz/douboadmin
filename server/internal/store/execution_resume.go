package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"time"
)

// Reset only the deadline: mixed-media workflows persist additional fields here.
// The caller updates the job and billing guard in this same transaction.
func resetExecutionDeadline(tx Transaction, id string) error {
	row, err := tx.Get("executions", id)
	if errors.Is(err, core.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	var data map[string]json.RawMessage
	if err = json.Unmarshal(row.Data, &data); err != nil {
		return err
	}
	var phase string
	if err = json.Unmarshal(data["phase"], &phase); err != nil {
		return err
	}
	if phase != "polling" && phase != "output" && phase != "succeeded" {
		return core.ErrConflict
	}
	data["startedAt"] = core.Data(time.Now().UTC())
	row.Data = core.Data(data)
	_, err = tx.Put("executions", row, row.Version)
	return err
}
