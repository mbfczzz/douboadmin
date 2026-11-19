package provider

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/llm"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// DirectChat runs chat jobs whose model key is "deepseek:…" or "ark:…" at the
// provider itself (not the relay), and records the tokens used so settlement
// charges by usage when the model is priced per token.
type DirectChat struct {
	Clients map[string]*llm.Client // by provider: "deepseek", "ark"
	Store   store.Store
	Assets  AssetResolver
}

// Handles reports whether the job's chat model is called directly.
func (p *DirectChat) Handles(ctx context.Context, j core.Job) bool {
	if p == nil || j.Input.Kind != "chat" {
		return false
	}
	m, err := p.model(ctx, j.Input.Model)
	if err != nil {
		return false
	}
	_, _, ok := core.DirectChat(m.Key)
	return ok
}

func (p *DirectChat) model(ctx context.Context, id string) (core.Model, error) {
	var m core.Model
	row, err := p.Store.Get(ctx, "models", id)
	if err == nil {
		err = json.Unmarshal(row.Data, &m)
	}
	return m, err
}

func (p *DirectChat) Generate(ctx context.Context, j core.Job) (string, error) {
	row, err := p.Store.Get(ctx, "executions", j.ID)
	if err == nil {
		var e Execution
		if json.Unmarshal(row.Data, &e) != nil {
			return "", fmt.Errorf("任务状态记录无效")
		}
		switch e.Phase {
		case "succeeded":
			// The reply is kept; usage may still need recording after a crash.
			if m, err := p.model(ctx, j.Input.Model); err == nil && m.Settings.TokenPriced() {
				if p.recordUsage(ctx, j.ID, m.Settings, llm.Usage{Input: e.InputTokens, Output: e.OutputTokens}) != nil {
					return "", ErrPending
				}
			}
			return e.Result, nil
		case "failed":
			return "", errors.New(e.Error)
		}
		// Interrupted mid-call: a chat turn is cheap to resend, so end it and
		// return the points rather than holding them for review.
		e.Phase, e.Error = "failed", "对话中断，请重新发送"
		_ = p.checkpoint(ctx, &row, e)
		return "", errors.New(e.Error)
	}
	if !errors.Is(err, core.ErrNotFound) {
		return "", ErrPending
	}
	m, err := p.model(ctx, j.Input.Model)
	if err != nil || !m.Effective().Usable() {
		return "", fmt.Errorf("对话模型已停用，请重新选择")
	}
	provider, key, _ := core.DirectChat(m.Key)
	client := p.Clients[provider]
	if !client.Ready() {
		return "", fmt.Errorf("对话模型尚未配置，请联系管理员")
	}
	messages, err := p.messages(ctx, j, provider)
	if err != nil {
		return "", err
	}
	e := Execution{Phase: "submitting", ModelKey: m.Key, StartedAt: time.Now().UTC()}
	row = core.Record{ID: j.ID}
	if err = p.checkpoint(ctx, &row, e); err != nil {
		return "", ErrPending // another worker owns this turn
	}
	text, usage, err := client.Complete(ctx, key, messages, m.Settings.OutputTokens())
	if err != nil {
		e.Phase, e.Error = "failed", err.Error()
		_ = p.checkpoint(ctx, &row, e)
		return "", err
	}
	if usage.Input+usage.Output == 0 { // provider omitted usage: count characters instead
		usage = llm.Usage{Input: len([]rune(j.Input.Prompt)), Output: len([]rune(text))}
	}
	e.Phase, e.Result, e.InputTokens, e.OutputTokens = "succeeded", text, usage.Input, usage.Output
	if err = p.checkpoint(ctx, &row, e); err != nil {
		return "", ErrPending // the next attempt sees "submitting" and ends the turn
	}
	if m.Settings.TokenPriced() {
		if err = p.recordUsage(ctx, j.ID, m.Settings, usage); err != nil {
			return "", ErrPending // retried from the "succeeded" checkpoint
		}
	}
	return text, nil
}

func (p *DirectChat) messages(ctx context.Context, j core.Job, provider string) ([]any, error) {
	content := any(j.Input.Prompt)
	if len(j.Input.Assets) > 0 {
		refs, err := p.Assets(ctx, j)
		if err != nil {
			return nil, err
		}
		parts := []any{map[string]string{"type": "text", "text": j.Input.Prompt}}
		for _, r := range refs {
			if r.Type != "image" {
				continue
			}
			if provider == "deepseek" {
				return nil, fmt.Errorf("DeepSeek 不能识别图片，请换用豆包模型")
			}
			parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]string{"url": r.URL}})
		}
		content = parts
	}
	body := map[string]any{"messages": []any{map[string]any{"role": "user", "content": content}}}
	if err := chatHistory(ctx, p.Store, j, body); err != nil {
		return nil, ErrPending
	}
	return body["messages"].([]any), nil
}

// recordUsage stores the charge for this turn on its billing row; completion
// settles it (charging at most the hold) in the same step that ends the job.
func (p *DirectChat) recordUsage(ctx context.Context, id string, s core.ModelSettings, u llm.Usage) error {
	row, err := p.Store.Get(ctx, "job_billing", id)
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
	if bill.State != "reserved" {
		return nil // free (billing off) or already settled
	}
	used, err := billing.TokenUnits(s, u.Input, u.Output)
	if err != nil {
		return err
	}
	bill.UsedUnits, bill.InputTokens, bill.OutputTokens = &used, u.Input, u.Output
	row.Data = core.Data(bill)
	_, err = p.Store.Put(ctx, "job_billing", row, row.Version)
	return err
}

func (p *DirectChat) checkpoint(ctx context.Context, row *core.Record, e Execution) error {
	v, err := p.Store.Put(ctx, "executions", core.Record{ID: row.ID, Data: core.Data(e)}, row.Version)
	if err == nil {
		*row = v
	}
	return err
}
