package provider

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"time"
)

// PartialEvery is how often a reply being written is saved for readers in
// other processes; readers in this one get every change through Turns.
var PartialEvery = 200 * time.Millisecond

var errTurnTaken = errors.New("another worker owns this chat turn")

// partial publishes the reply so far and saves it on the turn's execution at
// most every PartialEvery. A failed save means another worker took the turn:
// stop. written keeps the latest text (for a reply the user stops).
func (p *DirectChat) partial(ctx context.Context, id string, row *core.Record, e *Execution, written *string) func(string) error {
	var last time.Time
	return func(text string) error {
		*written = text
		Turns.set(id, text)
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
	if text, _, ok := Turns.Watch(id); ok {
		return text
	}
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
