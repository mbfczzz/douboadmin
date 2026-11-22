package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"strings"
)

// Uncertain submissions may carry extra detail after the standard sentence.
var uncertainPrefix = strings.SplitN(provider.ErrUncertain.Error(), "，", 2)[0]

func (a *Server) presentJob(ctx context.Context, j *core.Job) {
	a.hideTemplateRecipe(ctx, j)
	resultRef := j.Result
	j.Featured, j.WorkMetaVersion = false, 0
	j.ErrorCode, j.ErrorType, j.ErrorAction, j.ErrorEditable = 0, "", "", false
	j.Results = nil
	if j.Input.Kind == "image" {
		refs, err := core.ResultRefs(resultRef)
		j.Result = ""
		if err == nil && len(refs) > 0 {
			resultRef, j.Result = refs[0], refs[0]
			j.Results = refs
			if a.Media != nil {
				j.Results, _ = a.Media.ResultURLs(ctx, core.PackResults(refs))
			}
			if len(j.Results) > 0 {
				j.Result = j.Results[0]
			} else {
				j.Result = ""
			}
		}
	}
	j.ThumbnailURL = ""
	if strings.HasPrefix(resultRef, "asset:") {
		j.ResultAssetID = strings.TrimPrefix(resultRef, "asset:")
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
			j.Featured = meta.Featured && !meta.Deleted
			j.WorkMetaVersion = row.Version
		}
	}
	if core.IsWork(j.Input.Kind) {
		// No review step: older mini-program builds still read this field
		// before offering 分享, so report every work as shareable.
		j.ReviewStatus = "approved"
	}
	verifiedRefund, hinted := false, false
	if row, e := a.Store.Get(ctx, "job_billing", j.ID); e == nil {
		var bill core.JobBilling
		if json.Unmarshal(row.Data, &bill) == nil {
			j.CostUnits = bill.Units
			j.BillingState = bill.State
			if j.Status == "failed" && bill.State == "released" && strings.HasPrefix(j.Error, uncertainPrefix) {
				j.Error = "已核实上游未生成结果，积分已退回，可重新提交创作"
				verifiedRefund = true
			}
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
			j.Results = nil
		}
	}
	if actor, ok := ctx.Value(identityKey).(Identity); ok && (actor.Role == "admin" || actor.Role == "user" && actor.ID == j.UserID) && j.Status == "succeeded" && !j.Deleted && j.Result != "" && a.Media != nil {
		kind := j.Input.Kind
		if kind == "import" { // an imported (or 一键复刻) original is a video
			kind = "video"
		}
		j.ThumbnailURL, _ = a.Media.Thumbnail(ctx, resultRef, kind)
	}
	j.Retryable = false
	if j.Input.Assets == nil {
		j.Input.Assets = []string{}
	}
	// Import jobs cannot be retried through /jobs/{id}/retry (not a generation).
	if j.Status == "failed" && core.IsGeneration(j.Input.Kind) {
		r, err := a.Store.Get(ctx, "executions", j.ID)
		if err == core.ErrNotFound {
			j.Retryable = true
			return
		}
		var e provider.Execution
		if err == nil && json.Unmarshal(r.Data, &e) == nil {
			j.Retryable = e.Phase == "failed"
			j.ErrorCode, j.ErrorType, j.ErrorAction = e.ErrorCode, e.ErrorType, e.ErrorAction
			if e.ErrorCode == 5003 && strings.Contains(strings.ToLower(e.ErrorCause), "no provider route supports the requested parameters/input") {
				j.ErrorAction = "当前模型没有能处理这组参数和素材的通道，请更换模型或调整规格。"
			}
			j.ErrorEditable = e.ErrorEditable
			if e.ErrorCode != 0 {
				j.Retryable = e.ErrorRetryable
			}
			// An error hint must not hide the refund outcome shown above.
			if e.ErrorCause != "" && !verifiedRefund && j.Error != (&core.JobTimeout{Kind: j.Input.Kind}).Error() {
				if m, lookup := a.model(ctx, j.Input.Model); lookup == nil {
					before := j.Error
					j.Error = m.Settings.ErrorMessage(e.ErrorCause, j.Error)
					hinted = j.Error != before // the operator's own wording for users
				}
			}
		}
	}
	if j.Deleted {
		if actor, ok := ctx.Value(identityKey).(Identity); !ok || actor.Role != "admin" {
			j.Result = ""
			j.Results = nil
		}
	}
	if !isAdmin(ctx) {
		publicFailure(j, hinted) // users see only what they can act on (job_error.go)
	}
}
