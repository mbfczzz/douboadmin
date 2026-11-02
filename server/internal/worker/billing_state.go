package worker

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

func holdFailedCharge(ctx context.Context, s store.Store, id string, cause error) bool {
	if errors.Is(cause, provider.ErrUncertain) {
		return true
	}
	row, err := s.Get(ctx, "executions", id)
	if errors.Is(err, core.ErrNotFound) {
		return false
	}
	// A temporary lookup failure or damaged state does not prove that generation failed.
	if err != nil {
		return true
	}
	var execution provider.Execution
	if json.Unmarshal(row.Data, &execution) != nil {
		return true
	}
	return execution.Phase != "failed"
}
