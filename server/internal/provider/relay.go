package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"
)

var ErrPending = errors.New("上游任务处理中")
var ErrUncertain = errors.New("提交结果暂未确认，请联系管理员核实；为避免重复扣费，已停止自动重试")

type Provider interface {
	Generate(context.Context, core.Job) (string, error)
}
type AssetResolver func(context.Context, core.Job) ([]core.Reference, error)
type ResultSaver func(context.Context, core.Job, string) (string, error)
type Relay struct {
	Client     *relay.Client
	Store      store.Store
	Assets     AssetResolver
	SaveResult ResultSaver
}

type Execution struct {
	EstimatedCostMicros *int64 `json:"estimatedCostMicros,omitempty"`
	ErrorCause          string `json:"errorCause,omitempty"`
	Phase               string `json:"phase"`
	TaskID              string `json:"taskId,omitempty"`
	ModelKey            string `json:"modelKey"`
	Result              string `json:"result,omitempty"`
	Error               string `json:"error,omitempty"`
	// Note is the latest reason a task is still waiting, for administrators.
	Note      string    `json:"note,omitempty"`
	StartedAt time.Time `json:"startedAt"`
}

func (p *Relay) checkpoint(ctx context.Context, row *core.Record, e Execution) error {
	v, err := p.Store.Put(ctx, "executions", core.Record{ID: row.ID, Data: core.Data(e)}, row.Version)
	if err == nil {
		*row = v
	}
	return err
}

func (p *Relay) Generate(ctx context.Context, j core.Job) (string, error) {
	row, err := p.Store.Get(ctx, "executions", j.ID)
	var e Execution
	var raw []byte
	// A submit reply may say "success" before the result exists; only a poll
	// that reports success without a result means the output is unreadable.
	submitted := false
	if errors.Is(err, core.ErrNotFound) {
		model, lookup := p.Store.Get(ctx, "models", j.Input.Model)
		if lookup != nil {
			return "", fmt.Errorf("生成模型不存在")
		}
		var m core.Model
		if json.Unmarshal(model.Data, &m) != nil || !m.Effective().Usable() {
			return "", fmt.Errorf("生成模型已停用，请重新选择")
		}
		assets, err := p.Assets(ctx, j)
		if err != nil {
			return "", err
		}
		path, body, err := Request(j.Input, m.Key, assets)
		if err != nil {
			return "", err
		}
		if j.Input.Kind == "chat" {
			if err = p.chatHistory(ctx, j, body); err != nil {
				return "", ErrPending
			}
		}
		e = Execution{Phase: "submitting", ModelKey: m.Key, StartedAt: time.Now().UTC()}
		if m.Settings.CostUSD != "" {
			if cost, er := strconv.ParseFloat(m.Settings.CostUSD, 64); er == nil {
				micros := int64(cost*1e6 + .5)
				e.EstimatedCostMicros = &micros
			}
		}
		row = core.Record{ID: j.ID}
		// A unique durable insert wins the right to submit ONCE across all workers.
		if err = p.checkpoint(ctx, &row, e); err != nil {
			return "", ErrPending
		}
		raw, err = p.Client.Do(ctx, "POST", path, body)
		submitted = err == nil
		if err != nil {
			var httpErr *relay.HTTPError
			// 4xx (except timeouts) and 503 mean the request was not accepted, so the
			// hold can be released; 500/502/504 may have reached the upstream.
			if errors.As(err, &httpErr) && ((httpErr.Status >= 400 && httpErr.Status < 500 && httpErr.Status != 408) || httpErr.Status == 503) {
				e.Phase = "failed"
				e.Error, e.ErrorCause = p.failure(ctx, j, err)
			} else {
				e.Phase = "uncertain"
				e.Error = ErrUncertain.Error()
				_, e.ErrorCause = p.failure(ctx, j, err)
			}
			if save := p.checkpoint(ctx, &row, e); save != nil {
				return "", ErrPending
			}
			return "", errors.New(e.Error)
		}
	} else if err != nil {
		return "", ErrPending
	} else {
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
		if time.Since(e.StartedAt) > time.Hour {
			return "", fmt.Errorf("上游任务超过一小时，请联系管理员核实后继续查询")
		}
		raw, err = p.Client.Poll(ctx, e.TaskID)
		if err != nil {
			p.waiting(ctx, &row, e, "查询上游任务失败："+p.redact(err))
			return "", ErrPending
		}
	}
	res, err := Parse(raw, j.Input.Kind)
	if res.TaskID != "" {
		e.TaskID = res.TaskID
	}
	var unreadable *Unreadable
	if errors.As(err, &unreadable) && submitted && e.TaskID != "" {
		e.Phase, e.Note = "polling", "上游已受理，等待结果"
		_ = p.checkpoint(ctx, &row, e)
		return "", ErrPending
	}
	if errors.As(err, &unreadable) {
		// Upstream finished; never resubmit. Keep it resumable once handled.
		e.Phase, e.Note = "polling", err.Error()
		if e.TaskID == "" {
			e.Phase = "uncertain"
		}
		if save := p.checkpoint(ctx, &row, e); save != nil {
			return "", ErrPending
		}
		return "", errors.New("上游显示已完成，但未能识别生成结果，请联系管理员核实")
	}
	if err != nil {
		e.Phase = "failed"
		e.Error, e.ErrorCause = p.failure(ctx, j, err)
		var rejected *Rejected
		if !errors.As(err, &rejected) {
			if e.TaskID != "" {
				e.Phase = "polling"
				_ = p.checkpoint(ctx, &row, e)
				return "", ErrPending
			}
			e.Phase = "uncertain"
			e.Error = ErrUncertain.Error()
		}
		if save := p.checkpoint(ctx, &row, e); save != nil {
			return "", ErrPending
		}
		return "", errors.New(e.Error)
	}
	if res.TaskID != "" {
		e.TaskID = res.TaskID
	}
	if res.Pending {
		if e.TaskID == "" {
			return "", ErrUncertain
		}
		e.Phase, e.Note = "polling", "上游状态："+res.Status
		if res.Status == "" {
			e.Note = "上游已受理，等待结果"
		}
		_ = p.checkpoint(ctx, &row, e)
		return "", ErrPending
	}
	e.Phase, e.Note = "output", ""
	e.Result = res.Result
	if err = p.checkpoint(ctx, &row, e); err != nil {
		return "", ErrPending
	}
	return p.save(ctx, j, &row, e)
}

func (p *Relay) save(ctx context.Context, j core.Job, row *core.Record, e Execution) (string, error) {
	if j.Input.Kind != "chat" {
		result, err := p.SaveResult(ctx, j, e.Result)
		if err != nil {
			if time.Since(e.StartedAt) > time.Hour {
				return "", fmt.Errorf("生成已完成，但结果保存失败，请联系管理员恢复任务")
			}
			p.waiting(ctx, row, e, "结果保存失败，将自动重试："+p.redact(err))
			return "", ErrPending
		}
		e.Result = result
	}
	e.Phase, e.Note = "succeeded", ""
	if p.checkpoint(ctx, row, e) != nil {
		return "", ErrPending
	}
	return e.Result, nil
}
