package provider

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"time"
)

// PartialEvery is how often a reply being written is saved for the page to show.
var PartialEvery = 400 * time.Millisecond

var errTurnTaken = errors.New("another worker owns this chat turn")

// partial saves the reply so far on the turn's execution, at most every
// PartialEvery. A failed save means another worker took the turn: stop.
func (p *DirectChat) partial(ctx context.Context, row *core.Record, e *Execution) func(string) error {
	var last time.Time
	return func(text string) error {
		if time.Since(last) < PartialEvery {
			return nil
		}
		last = time.Now()
		e.Partial = text
		if p.checkpoint(ctx, row, *e) != nil {
			return errTurnTaken
		}
		return nil
	}
}

// Partial is the reply so far for a chat turn still being written ("" when
// none has arrived yet or the turn is not a direct chat).
func Partial(ctx context.Context, s interface {
	Get(context.Context, string, string) (core.Record, error)
}, id string) string {
	row, err := s.Get(ctx, "executions", id)
	if err != nil {
		return ""
	}
	var e Execution
	if json.Unmarshal(row.Data, &e) != nil || e.Phase != "submitting" {
		return ""
	}
	return e.Partial
}
