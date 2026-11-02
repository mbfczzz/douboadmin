package mixing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"errors"
)

type recoverable struct{ error }

func (e *Engine) generateChild(ctx context.Context, j core.Job, parent *State) (string, error) {
	row, lookup := e.Store.Get(ctx, "executions", j.ID)
	if lookup == nil {
		var execution provider.Execution
		_ = json.Unmarshal(row.Data, &execution)
		if parent.StartedAt.After(execution.StartedAt) && (execution.Phase == "polling" || execution.Phase == "output") {
			execution.StartedAt = parent.StartedAt
			row.Data = core.Data(execution)
			_, _ = e.Store.Put(ctx, "executions", row, row.Version)
		}
	}
	result, err := e.AI.Generate(ctx, j)
	if err == nil || errors.Is(err, provider.ErrPending) {
		return result, err
	}
	if row, lookup = e.Store.Get(ctx, "executions", j.ID); lookup == nil {
		var execution provider.Execution
		_ = json.Unmarshal(row.Data, &execution)
		parent.TaskID = execution.TaskID
		if execution.Phase == "polling" || execution.Phase == "output" {
			return "", recoverable{err}
		}
	}
	return result, err
}
