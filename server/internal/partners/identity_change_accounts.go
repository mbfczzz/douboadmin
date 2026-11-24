package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

func pausePartnerAccounts(tx store.Transaction, partner string) ([]string, error) {
	rows, e := tx.Records("admin_accounts")
	if e != nil {
		return nil, e
	}
	paused := []string{}
	for _, item := range rows {
		var account core.AdminAccount
		if json.Unmarshal(item.Data, &account) != nil || account.PartnerID != partner || account.Archived || account.Disabled {
			continue
		}
		locked, e := tx.Lock("admin_accounts", core.Record{ID: item.ID})
		if e != nil {
			return paused, e
		}
		if json.Unmarshal(locked.Data, &account) != nil {
			return paused, rulef("后台账号状态异常")
		}
		account.Disabled = true
		locked.Data = core.Data(account)
		if _, e = tx.Put("admin_accounts", locked, locked.Version); e != nil {
			return paused, e
		}
		paused = append(paused, item.ID)
	}
	return paused, nil
}

func restorePartnerAccounts(tx store.Transaction, ids []string) error {
	for _, id := range ids {
		row, e := tx.Lock("admin_accounts", core.Record{ID: id})
		if errors.Is(e, core.ErrNotFound) {
			continue
		}
		if e != nil {
			return e
		}
		var account core.AdminAccount
		if json.Unmarshal(row.Data, &account) != nil {
			return rulef("后台账号状态异常")
		}
		if account.Archived {
			continue
		}
		account.Disabled = false
		row.Data = core.Data(account)
		if _, e = tx.Put("admin_accounts", row, row.Version); e != nil {
			return e
		}
	}
	return nil
}

func mergeIDs(current, next []string) []string {
	seen, out := map[string]bool{}, []string{}
	for _, id := range append(current, next...) {
		if id != "" && !seen[id] {
			seen[id], out = true, append(out, id)
		}
	}
	return out
}

func finalizeVisitorRegistration(tx store.Transaction, user, actor, kind string) error {
	row, reg, e := get[core.Registration](tx, "registrations", user)
	if errors.Is(e, core.ErrNotFound) || reg.Status != "pending" || reg.Role != core.RoleVisitor {
		return nil
	}
	if e != nil {
		return e
	}
	now := nowUTC()
	reg.Status, reg.Reason, reg.DecidedBy, reg.DecidedAt = "approved", "管理员调整为"+kind, actor, &now
	if _, e = put(tx, "registrations", row, reg); e != nil {
		return e
	}
	return saveCodeUse(tx, user, reg)
}
