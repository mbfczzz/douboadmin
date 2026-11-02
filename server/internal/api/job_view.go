package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"strings"
)

func (a *Server) presentJob(ctx context.Context, j *core.Job) {
	if strings.HasPrefix(j.Result, "asset:") {
		j.ResultAssetID = strings.TrimPrefix(j.Result, "asset:")
	}
	if row, e := a.Store.Get(ctx, "job_progress", j.ID); e == nil {
		var progress struct {
			Stage string `json:"stage"`
		}
		if json.Unmarshal(row.Data, &progress) == nil {
			j.Stage = progress.Stage
		}
	}
	if row, e := a.Store.Get(ctx, "work_meta", j.ID); e == nil {
		var meta core.WorkMeta
		if json.Unmarshal(row.Data, &meta) == nil {
			j.Deleted = meta.Deleted
		}
	}
	if core.IsWork(j.Input.Kind) {
		j.ReviewStatus = "pending"
		if row, e := a.Store.Get(ctx, "reviews", j.ID); e == nil {
			var review core.Review
			if json.Unmarshal(row.Data, &review) == nil {
				j.ReviewStatus = review.Status
			}
		}
	}
	if row, e := a.Store.Get(ctx, "job_billing", j.ID); e == nil {
		var bill core.JobBilling
		if json.Unmarshal(row.Data, &bill) == nil {
			j.CostUnits = bill.Units
			j.BillingState = bill.State
		}
	}
	if m, e := a.model(ctx, j.Input.Model); e == nil {
		j.ModelName = m.Name
	}
	if j.Input.Kind != "chat" && a.Media != nil && j.Result != "" {
		if u, e := a.Media.URL(ctx, j.Result); e == nil {
			j.Result = u
		} else {
			j.Result = ""
		}
	}
	j.Retryable = false
	if j.Status == "failed" && (core.IsGeneration(j.Input.Kind) || j.Input.Kind == "import") {
		r, err := a.Store.Get(ctx, "executions", j.ID)
		if err == core.ErrNotFound {
			j.Retryable = true
			return
		}
		var e provider.Execution
		if err == nil && json.Unmarshal(r.Data, &e) == nil {
			j.Retryable = e.Phase == "failed"
			if e.ErrorCause != "" {
				if m, lookup := a.model(ctx, j.Input.Model); lookup == nil {
					j.Error = m.Settings.ErrorMessage(e.ErrorCause, j.Error)
				}
			}
		}
	}
	if j.Deleted {
		if actor, ok := ctx.Value(identityKey).(Identity); !ok || actor.Role != "admin" {
			j.Result = ""
		}
	}
}
