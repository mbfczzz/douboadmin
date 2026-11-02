package provider

import (
	"context"
	"doubo/server/internal/core"
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
	if row, e := p.Store.Get(ctx, "models", j.Input.Model); e == nil {
		var m core.Model
		if json.Unmarshal(row.Data, &m) == nil {
			message = m.Settings.ErrorMessage(cause, message)
		}
	}
	return
}
