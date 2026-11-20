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
	"slices"
	"strings"
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
				if p.recordUsage(ctx, j.ID, m.Settings, llm.Usage{Input: e.InputTokens, Output: e.OutputTokens, Cached: e.CachedTokens}, billing.Peak(e.StartedAt)) != nil {
					return "", ErrPending
				}
			}
			return e.Result, nil
		case "failed":
			return "", errors.New(e.Error)
		}
		// Interrupted mid-call: a chat turn is cheap to resend, so end it and
		// return the points rather than holding them for review.
		e.Phase, e.Error, e.Partial = "failed", "对话中断，请重新发送", ""
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
	if stopAsked(ctx, p.Store, j.ID) {
		return "", errors.New("已停止回复")
	}
	// A long project's earlier turns are summarized first; that call is part
	// of this turn's usage.
	var spent llm.Usage
	summarize := func(ctx context.Context, text string) (string, error) {
		out, u, err := client.Complete(ctx, key, summaryMessages(text), billing.SummaryOutput, nil)
		spent.Input, spent.Cached, spent.Output = spent.Input+u.Input, spent.Cached+u.Cached, spent.Output+u.Output
		return out, err
	}
	messages, err := p.messages(ctx, j, m, summarize)
	if err != nil {
		return "", err
	}
	e := Execution{Phase: "submitting", ModelKey: m.Key, StartedAt: time.Now().UTC()}
	row = core.Record{ID: j.ID}
	if err = p.checkpoint(ctx, &row, e); err != nil {
		return "", ErrPending // another worker owns this turn
	}
	fail := func(err error) (string, error) {
		e.Phase, e.Error, e.Partial = "failed", err.Error(), ""
		_ = p.checkpoint(ctx, &row, e)
		return "", err
	}
	call, cancel := context.WithCancel(ctx)
	defer cancel()
	Turns.start(j.ID, cancel)
	defer Turns.finish(j.ID)
	go watchStop(call, p.Store, j.ID, cancel)
	written := ""
	text, usage, err := client.Complete(call, key, messages, m.Settings.OutputTokens(), p.partial(ctx, j.ID, &row, &e, &written))
	if errors.Is(err, errTurnTaken) {
		return "", ErrPending
	}
	if err != nil && ctx.Err() == nil && stopAsked(ctx, p.Store, j.ID) {
		// Stopped by the user: keep what was written, charge for it.
		if strings.TrimSpace(written) == "" {
			return fail(errors.New("已停止回复"))
		}
		text, usage, err = strings.TrimSpace(written)+"\n\n（已停止回复）", llm.Usage{Input: estimateTokens(messages), Output: len([]rune(written))}, nil
	}
	if err != nil {
		return fail(err)
	}
	if usage.Input+usage.Output == 0 { // provider omitted usage: count characters instead
		usage = llm.Usage{Input: estimateTokens(messages), Output: len([]rune(text))}
	}
	usage.Input, usage.Cached, usage.Output = usage.Input+spent.Input, usage.Cached+spent.Cached, usage.Output+spent.Output
	e.Partial = ""
	e.Phase, e.Result, e.InputTokens, e.OutputTokens, e.CachedTokens = "succeeded", text, usage.Input, usage.Output, usage.Cached
	if err = p.checkpoint(ctx, &row, e); err != nil {
		return "", ErrPending // the next attempt sees "submitting" and ends the turn
	}
	if m.Settings.TokenPriced() {
		if err = p.recordUsage(ctx, j.ID, m.Settings, usage, billing.Peak(e.StartedAt)); err != nil {
			return "", ErrPending // retried from the "succeeded" checkpoint
		}
	}
	return text, nil
}

// estimateTokens bounds a request's tokens by its characters (and 1500 per
// picture) when the provider reported none.
func estimateTokens(messages []any) int {
	raw, _ := json.Marshal(messages)
	return len([]rune(string(raw))) + 1500*strings.Count(string(raw), `"image_url"`)
}

func (p *DirectChat) messages(ctx context.Context, j core.Job, m core.Model, summarize Summarizer) ([]any, error) {
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
			if !slices.Contains(m.ReferenceTypes, "image") { // e.g. deepseek-v4-pro
				return nil, fmt.Errorf("%s 不能识别图片，请换用能看图的模型", m.Name)
			}
			parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]string{"url": r.URL}})
		}
		content = parts
	}
	body := map[string]any{"messages": []any{map[string]any{"role": "user", "content": content}}}
	if err := chatHistory(ctx, p.Store, j, body, summarize); err != nil {
		return nil, ErrPending
	}
	return body["messages"].([]any), nil
}

// recordUsage stores the charge for this turn on its billing row; completion
// settles it (charging at most the hold) in the same step that ends the job.
func (p *DirectChat) recordUsage(ctx context.Context, id string, s core.ModelSettings, u llm.Usage, peak bool) error {
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
	used, err := billing.TokenUnits(s, billing.Tokens{Input: u.Input, Cached: u.Cached, Output: u.Output}, peak)
	if err != nil {
		return err
	}
	bill.UsedUnits, bill.InputTokens, bill.OutputTokens, bill.CachedTokens = &used, u.Input, u.Output, u.Cached
	bill.Peak = peak && s.PeakPriceRate > 1
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
