package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
)

func (a *Server) bindLoginPhone(ctx context.Context, user, phone string) (problem string, err error) {
	err = a.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := lockIdentity(tx); e != nil {
			return e
		}
		problem = ""
		ok, e := claimPhone(tx, phone, user)
		if e != nil {
			return e
		}
		if !ok {
			problem = errPhoneTaken
			return nil
		}
		row, e := tx.Get("users", user)
		if e != nil {
			return e
		}
		var profile struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(row.Data, &profile) != nil {
			return fmt.Errorf("账号资料异常")
		}
		return saveProfile(tx, user, profile.Name, phone)
	})
	return
}

// Finish name entry after a verified-phone login. Check proof and write under
// the same row lock; client flags cannot bypass SMS for another number.
func (a *Server) registerVerifiedPhone(ctx context.Context, user, name, phone string) (verified bool, err error) {
	err = a.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := lockIdentity(tx); e != nil {
			return e
		}
		verified = false
		row, e := tx.Lock("users", core.Record{ID: user})
		if e != nil {
			return e
		}
		var profile map[string]any
		if json.Unmarshal(row.Data, &profile) != nil || profile == nil {
			return fmt.Errorf("账号资料异常")
		}
		if profile["phone"] != phone || profile["verifiedPhone"] != phone {
			return nil
		}
		profile["name"] = name
		row.Data = core.Data(profile)
		if _, e = putUniqueUser(tx, row, row.Version); e != nil {
			return e
		}
		verified = true
		return nil
	})
	return
}
