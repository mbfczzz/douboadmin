package partners

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/base32"
	"encoding/base64"
	"encoding/json"
	"errors"
)

type control struct {
	CodeKey string `json:"codeKey"`
}

func lockControl(tx store.Transaction) error {
	row, e := tx.Lock("partner_control", core.Record{ID: "tree", Data: core.Data(control{})})
	if e != nil {
		return e
	}
	var c control
	if e = json.Unmarshal(row.Data, &c); e != nil {
		return e
	}
	if c.CodeKey != "" {
		return nil
	}
	key := make([]byte, 32)
	if _, e = rand.Read(key); e != nil {
		return e
	}
	c.CodeKey = base64.StdEncoding.EncodeToString(key)
	_, e = put(tx, "partner_control", row, c)
	return e
}
func codeFor(r Reader, seed string) (string, error) {
	_, c, e := get[control](r, "partner_control", "tree")
	if e != nil {
		return "", e
	}
	key, e := base64.StdEncoding.DecodeString(c.CodeKey)
	if e != nil || len(key) != 32 {
		return "", rulef("激活码密钥不可用")
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte("activation:" + seed))
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(mac.Sum(nil)[:12]), nil
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
