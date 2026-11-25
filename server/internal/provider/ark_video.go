package provider

import (
	"context"
	"doubo/server/internal/arkvideo"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// submitMargin: a task is not submitted with less time than this left
// before the job's deadline (方舟 also drops it after an hour, request.go).
const submitMargin = 20 * time.Minute

// ArkVideo generates the fixed Seedance models at 火山方舟 (arkvideo: keys).
// Jobs still come only through /api/jobs; this replaces the relay for these
// models alone. A task is submitted once (the executions row is the claim),
// polled, its reported video tokens recorded on the job's billing row
// (completion charges them, at most the hold, and returns the rest), and the
// video saved to our storage.
type ArkVideo struct {
	Client     *arkvideo.Client
	Store      store.Store
	Assets     AssetResolver
	SaveResult ResultSaver
}

// Route reports a job for a fixed 火山方舟 video model. A task already
// submitted is known by its execution row, so a passing read error never
// sends it to the relay; an error means "try again later".
func (p *ArkVideo) Route(ctx context.Context, j core.Job) (bool, error) {
	if p == nil || j.Input.Kind != "video" {
		return false, nil
	}
	if row, err := p.Store.Get(ctx, "executions", j.ID); err == nil {
		var e Execution
		if json.Unmarshal(row.Data, &e) == nil && e.ModelKey != "" {
			_, ok := core.ArkVideo(e.ModelKey)
			return ok, nil
		}
	} else if !errors.Is(err, core.ErrNotFound) {
		return false, err
	}
	m, err := p.model(ctx, j)
	if err != nil {
		return false, err
	}
	_, ok := core.ArkVideo(m.Key)
	return ok, nil
}

func (p *ArkVideo) model(ctx context.Context, j core.Job) (core.Model, error) {
	row, err := p.Store.Get(ctx, "models", j.Input.Model)
	var m core.Model
	if err == nil {
		err = json.Unmarshal(row.Data, &m)
	}
	return m.Effective(), err
}

func (p *ArkVideo) Generate(ctx context.Context, j core.Job) (string, error) {
	if core.JobExpired(j, time.Now()) {
		return "", &core.JobTimeout{Kind: j.Input.Kind}
	}
	row, err := p.Store.Get(ctx, "executions", j.ID)
	if errors.Is(err, core.ErrNotFound) {
		return p.submit(ctx, j)
	}
	if err != nil {
		return "", ErrPending
	}
	var e Execution
	if json.Unmarshal(row.Data, &e) != nil {
		return "", fmt.Errorf("任务状态记录无效")
	}
	switch e.Phase {
	case "succeeded":
		return e.Result, nil
	case "failed":
		return "", errors.New(e.Error)
	case "submitting", "uncertain":
		return "", ErrUncertain
	case "output":
		return p.save(ctx, j, &row, e)
	}
	if e.TaskID == "" {
		return "", ErrUncertain
	}
	task, err := p.Client.Get(ctx, e.TaskID)
	if err != nil {
		p.note(ctx, &row, e, "查询火山方舟任务失败："+err.Error())
		return "", ErrRetryLater
	}
	switch task.Status {
	case "succeeded":
		if task.Content.VideoURL == "" {
			p.note(ctx, &row, e, "火山方舟显示已完成，但没有返回视频地址")
			return "", ErrRetryLater
		}
		if err := p.recordUsage(ctx, j, task.Usage.CompletionTokens); err != nil {
			return "", ErrRetryLater
		}
		e.Phase, e.Note, e.Result, e.OutputTokens = "output", "", task.Content.VideoURL, int(task.Usage.CompletionTokens)
		if p.checkpoint(ctx, &row, e) != nil {
			return "", ErrPending
		}
		return p.save(ctx, j, &row, e)
	case "failed", "cancelled", "expired":
		reason := &arkvideo.APIError{Code: task.Status, Message: "任务" + task.Status}
		if task.Error != nil {
			reason = task.Error
		}
		return "", p.fail(ctx, j, &row, e, reason)
	}
	p.note(ctx, &row, e, "火山方舟任务状态："+task.Status)
	return "", ErrPending
}

func (p *ArkVideo) submit(ctx context.Context, j core.Job) (string, error) {
	if !p.Client.Ready() {
		return "", fmt.Errorf("火山方舟视频生成尚未配置")
	}
	m, err := p.model(ctx, j)
	modelID, ok := core.ArkVideo(m.Key)
	if err != nil || !ok || !m.Usable() {
		return "", fmt.Errorf("生成模型已停用，请重新选择")
	}
	// Not submitted this close to the job's deadline: the task could finish
	// (and be billed by 方舟) after the job has timed out.
	if deadline := core.JobDeadline(j); !deadline.IsZero() && time.Until(deadline) < submitMargin {
		return "", &core.JobTimeout{Kind: j.Input.Kind}
	}
	refs, err := p.Assets(ctx, j)
	if err != nil {
		return "", err
	}
	body, err := arkvideo.Body(modelID, j.Input, refs)
	if err != nil {
		return "", err
	}
	e := Execution{Phase: "submitting", ModelKey: m.Key, StartedAt: time.Now().UTC()}
	row := core.Record{ID: j.ID}
	// The unique insert wins the right to submit once across all workers.
	if p.checkpoint(ctx, &row, e) != nil {
		return "", ErrPending
	}
	id, err := p.Client.Create(ctx, body)
	// Whatever 方舟 answered is recorded even if this round has ended: losing
	// the task id would leave a billed task no one can follow.
	ctx = context.WithoutCancel(ctx)
	var api *arkvideo.APIError
	switch {
	case err == nil:
		e.Phase, e.TaskID, e.Note = "polling", id, "火山方舟已受理，等待结果"
		if err := p.checkpoint(ctx, &row, e); err != nil {
			// The row still says submitting, so it is never resubmitted; the
			// log keeps the task id for the administrator who checks it.
			slog.Error("火山方舟任务编号未能保存", "job", j.ID, "task", id, "error", err)
		}
		return "", ErrPending
	case errors.As(err, &api) && api.Status >= 400 && api.Status < 500 && api.Status != 408:
		return "", p.fail(ctx, j, &row, e, api) // refused: nothing was generated
	}
	// No reply, or a server error: the task may exist. Never resubmit; an
	// administrator checks it (the points stay held until then).
	e.Phase, e.Error, e.ErrorCause = "uncertain", ErrUncertain.Error(), err.Error()
	slog.Warn("火山方舟视频任务提交结果未知", "job", j.ID, "error", err)
	if p.checkpoint(ctx, &row, e) != nil {
		return "", ErrPending
	}
	return "", ErrUncertain
}

// fail ends a task with what the user can act on (content review, a
// parameter or material the model cannot take); anything else reads as a
// system error (api/job_error.go).
func (p *ArkVideo) fail(ctx context.Context, j core.Job, row *core.Record, e Execution, reason *arkvideo.APIError) error {
	e.Phase, e.ErrorCause, e.UpstreamCode = "failed", reason.Error(), reason.Code
	e.Error = "火山方舟生成失败"
	code := strings.ToLower(reason.Code)
	switch {
	case strings.Contains(code, "sensitive") || strings.Contains(code, "risk"):
		e.ErrorCode, e.ErrorEditable, e.Error = 5002, true, "内容未通过安全审核"
	case strings.Contains(code, "copyright"):
		e.ErrorCode, e.ErrorEditable, e.Error = 5009, true, "内容涉及版权限制"
	case strings.HasPrefix(code, "invalidparameter") || reason.Status == 400:
		e.ErrorCode, e.ErrorEditable, e.Error = 5003, true, "当前模型不支持这组参数或素材"
	default:
		e.ErrorRetryable = true
	}
	if m, err := p.model(ctx, j); err == nil { // 模型配置 → 错误提示
		e.Error = m.Settings.ErrorMessage(e.ErrorCause, e.Error)
	}
	if p.checkpoint(context.WithoutCancel(ctx), row, e) != nil {
		return ErrPending
	}
	return errors.New(e.Error)
}

// recordUsage puts the reported tokens, priced, on the job's billing row;
// completion settles it. Free (billing off) or settled jobs are left alone.
func (p *ArkVideo) recordUsage(ctx context.Context, j core.Job, tokens int64) error {
	row, err := p.Store.Get(ctx, "job_billing", j.ID)
	if errors.Is(err, core.ErrNotFound) {
		return nil
	}
	var bill core.JobBilling
	if err == nil {
		err = json.Unmarshal(row.Data, &bill)
	}
	if err != nil || bill.State != "reserved" || bill.UsedUnits != nil {
		return err
	}
	if tokens <= 0 { // no usage reported: the hold is charged, as before
		return nil
	}
	m, err := p.model(ctx, j)
	if err != nil {
		return err
	}
	withVideo := false // 方舟 prices tasks with an input video lower
	for _, id := range j.Input.Assets {
		var asset struct {
			Type string `json:"type"`
		}
		ref, err := p.Store.Get(ctx, "assets", id)
		if err == nil {
			err = json.Unmarshal(ref.Data, &asset)
		}
		if err != nil {
			return err // not guessed: the price differs
		}
		withVideo = withVideo || strings.HasPrefix(asset.Type, "video/")
	}
	used, err := billing.ArkVideoUnits(m, j.Input, tokens, withVideo)
	if err != nil {
		return err
	}
	bill.UsedUnits, bill.VideoTokens = &used, tokens
	row.Data = core.Data(bill)
	_, err = p.Store.Put(ctx, "job_billing", row, row.Version)
	return err
}

func (p *ArkVideo) save(ctx context.Context, j core.Job, row *core.Record, e Execution) (string, error) {
	result, err := p.SaveResult(ctx, j, e.Result)
	if err != nil { // retried until the job's own deadline (方舟's link lasts 24 hours)
		p.note(ctx, row, e, "结果保存失败，将自动重试："+err.Error())
		return "", ErrRetryLater
	}
	e.Phase, e.Note, e.Result = "succeeded", "", result
	if p.checkpoint(ctx, row, e) != nil {
		return "", ErrPending
	}
	return result, nil
}

func (p *ArkVideo) checkpoint(ctx context.Context, row *core.Record, e Execution) error {
	v, err := p.Store.Put(ctx, "executions", core.Record{ID: row.ID, Data: core.Data(e)}, row.Version)
	if err == nil {
		*row = v
	}
	return err
}

// note records why a task is still waiting (only changes are written).
func (p *ArkVideo) note(ctx context.Context, row *core.Record, e Execution, note string) {
	if e.Note != note {
		e.Note = note
		_ = p.checkpoint(context.WithoutCancel(ctx), row, e)
	}
}
