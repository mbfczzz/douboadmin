package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
)

// Opening a backend login later must use the branch's current phone binding,
// just as a login created together with the branch does.
func (a *Server) createBranchLogin(ctx context.Context, account core.AdminAccount) (out core.Record, err error) {
	err = a.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := lockIdentity(tx); e != nil {
			return e
		}
		row, e := tx.Get("partners", account.PartnerID)
		if e != nil {
			return e
		}
		var p core.Partner
		if e = json.Unmarshal(row.Data, &p); e != nil {
			return e
		}
		if p.Status == "deleted" {
			return core.ErrPartnerDisabled
		}
		mapping, e := tx.Get("branch_phones", p.Phone)
		if e != nil {
			return e
		}
		var binding branchPhone
		if e = json.Unmarshal(mapping.Data, &binding); e != nil {
			return e
		}
		if binding.PartnerID != account.PartnerID {
			return errIdentityMerge
		}
		if binding.AccountID != "" {
			old, e := tx.Get("admin_accounts", binding.AccountID)
			if e != nil {
				return e
			}
			var previous core.AdminAccount
			if e = json.Unmarshal(old.Data, &previous); e != nil {
				return e
			}
			if !previous.Archived {
				return core.ErrAdminPhoneTaken
			}
		}
		account.Phone = p.Phone
		out = core.Record{ID: adminID(account.Username)}
		if binding.UserID != "" {
			if e = linkAdminIdentity(tx, &account, out.ID, p.Phone, binding.UserID); e != nil {
				return e
			}
		}
		out.Data = core.Data(account)
		out, e = tx.Put("admin_accounts", out, 0)
		if e != nil {
			return e
		}
		binding.AccountID = out.ID
		mapping.Data = core.Data(binding)
		_, e = tx.Put("branch_phones", mapping, mapping.Version)
		return e
	})
	return
}
