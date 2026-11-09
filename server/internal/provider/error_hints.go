package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"errors"
	"strings"
)

func (p *Relay) failure(ctx context.Context, j core.Job, err error) (message, cause string) {
	cause = err.Error()
	var rejected *Rejected
	if errors.As(err, &rejected) {
		cause += " " + rejected.Details
	}
	if p.Client.Key != "" {
		cause = strings.ReplaceAll(cause, p.Client.Key, "[redacted]")
	}
	runes := []rune(cause)
	if len(runes) > 2000 {
		cause = string(runes[:2000])
	}
	message = err.Error()
	// Relay HTTP errors carry operator wording ("检查模型配置或账户额度") or the
	// upstream's own text; users get a plain message, admins keep the cause.
	var httpErr *relay.HTTPError
	if errors.As(err, &httpErr) {
		message = UserFailure
	}
	if row, e := p.Store.Get(ctx, "models", j.Input.Model); e == nil {
		var m core.Model
		if json.Unmarshal(row.Data, &m) == nil {
			message = m.Settings.ErrorMessage(cause, message)
		}
	}
	return
}

// UserFailure is what end users see when the relay refuses a request.
const UserFailure = "生成服务暂时无法完成该任务，请稍后重试或更换模型"

// redact shortens an error for the admin task note and removes the relay key.
func (p *Relay) redact(err error) string {
	text := err.Error()
	if p.Client != nil && p.Client.Key != "" {
		text = strings.ReplaceAll(text, p.Client.Key, "[redacted]")
	}
	if runes := []rune(text); len(runes) > 300 {
		text = string(runes[:300]) + "…"
	}
	return text
}

// waiting records why a task is still pending; only changes are written.
func (p *Relay) waiting(ctx context.Context, row *core.Record, e Execution, note string) {
	if e.Note != note {
		e.Note = note
		_ = p.checkpoint(ctx, row, e)
	}
}
