package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

// The partner tree lock is one shared row; holding it serializes every
// partner operation.
func lockControl(tx store.Transaction) error {
	_, e := tx.Lock("partner_control", core.Record{ID: "tree", Data: core.Data(map[string]string{})})
	return e
}
func (s *Service) command(ctx context.Context, actor, key string, input any, fn func(store.Transaction, string) (core.Record, error)) (result core.Record, err error) {
	if len(key) < 8 || len(key) > 128 {
		return result, rulef("请提供有效的请求标识")
	}
	id := core.Digest(actor + ":" + key)[:32]
	hash := core.Digest(string(core.Data(input)))
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		old, _, e := get[map[string]any](tx, "partner_commands", id)
		if e == nil {
			var saved struct {
				Hash   string      `json:"hash"`
				Result core.Record `json:"result"`
			}
			if e = json.Unmarshal(old.Data, &saved); e != nil {
				return e
			}
			if saved.Hash != hash {
				return core.ErrIdempotency
			}
			result = saved.Result
			return nil
		} else if !errors.Is(e, core.ErrNotFound) {
			return e
		}
		result, e = fn(tx, id)
		if e != nil {
			return e
		}
		_, e = tx.Put("partner_commands", core.Record{ID: id, Owner: actor, Data: core.Data(map[string]any{"hash": hash, "result": result})}, 0)
		return e
	})
	return
}
