package api

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"doubo/server/internal/core"
)

// Login times live in their own record so signing in never bumps the
// account's version; otherwise an admin's open edit of that account (role,
// status, password) would fail with a version conflict.
func (a *Server) recordLogin(ctx context.Context, id string) {
	data := core.Data(map[string]time.Time{"at": time.Now().UTC()})
	for range 2 {
		var version int64
		if row, e := a.Store.Get(ctx, "admin_logins", id); e == nil {
			version = row.Version
		} else if !errors.Is(e, core.ErrNotFound) {
			return
		}
		_, e := a.Store.Put(ctx, "admin_logins", core.Record{ID: id, Owner: id, Data: data}, version)
		if !errors.Is(e, core.ErrConflict) {
			return
		}
	}
}

// adminView hides the password hash and adds the latest login time.
func (a *Server) adminView(ctx context.Context, row core.Record) core.Record {
	var account core.AdminAccount
	if json.Unmarshal(row.Data, &account) != nil {
		return row
	}
	account.PasswordHash = ""
	if account.UserID != "" {
		if user, e := a.Store.Get(ctx, "users", account.UserID); e == nil {
			var p struct {
				Phone string `json:"phone"`
			}
			if json.Unmarshal(user.Data, &p) == nil {
				account.Phone = p.Phone
			}
		}
	}
	if login, e := a.Store.Get(ctx, "admin_logins", row.ID); e == nil {
		var v struct {
			At time.Time `json:"at"`
		}
		if json.Unmarshal(login.Data, &v) == nil && v.At.After(account.LastLoginAt) {
			account.LastLoginAt = v.At
		}
	}
	row.Data = core.Data(account)
	return row
}
