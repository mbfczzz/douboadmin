package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

// Called inside the user update transaction. A conflicting backend number
// rolls back both profiles and the phone reservation together.
func syncLinkedAdminPhone(tx store.Transaction, user, phone string) error {
	link, e := tx.Get("admin_user_links", user)
	if errors.Is(e, core.ErrNotFound) {
		return nil
	}
	if e != nil {
		return e
	}
	var v struct {
		AccountID string `json:"accountId"`
	}
	if e = json.Unmarshal(link.Data, &v); e != nil {
		return e
	}
	if v.AccountID == "" {
		return nil
	}
	row, e := tx.Lock("admin_accounts", core.Record{ID: v.AccountID})
	if e != nil {
		return e
	}
	var account core.AdminAccount
	if e = json.Unmarshal(row.Data, &account); e != nil {
		return e
	}
	if account.Archived || account.UserID != user || account.Phone == phone {
		return nil
	}
	account.Phone = phone
	row.Data = core.Data(account)
	_, e = tx.Put("admin_accounts", row, row.Version)
	return e
}
