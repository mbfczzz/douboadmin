package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

// Move the prebinding only with the same verified identity's profile update.
// Keep the claim marker so a revoked owner is never silently re-enabled.
func moveBranchPhone(tx store.Transaction, user, oldPhone, newPhone string) error {
	if oldPhone == "" || oldPhone == newPhone {
		return nil
	}
	old, e := tx.Get("branch_phones", oldPhone)
	if errors.Is(e, core.ErrNotFound) {
		return nil
	}
	if e != nil {
		return e
	}
	var binding branchPhone
	if e = json.Unmarshal(old.Data, &binding); e != nil {
		return e
	}
	if binding.PartnerID == "" || binding.UserID != user {
		return nil
	}
	if _, _, e = store.LockWallet(tx, user); e != nil {
		return e
	}
	if e = partners.Lock(tx); e != nil {
		return e
	}
	next, e := tx.Lock("branch_phones", core.Record{ID: newPhone, Data: core.Data(branchPhone{})})
	if e != nil {
		return e
	}
	var existing branchPhone
	if e = json.Unmarshal(next.Data, &existing); e != nil {
		return e
	}
	if existing.PartnerID != "" {
		return errBranchPhoneTaken
	}
	partner, e := tx.Get("partners", binding.PartnerID)
	if e != nil {
		return e
	}
	var p core.Partner
	if e = json.Unmarshal(partner.Data, &p); e != nil {
		return e
	}
	if p.Phone != oldPhone {
		return core.ErrConflict
	}
	p.Phone = newPhone
	partner.Data = core.Data(p)
	if _, e = tx.Put("partners", partner, partner.Version); e != nil {
		return e
	}
	next.Data = core.Data(binding)
	if _, e = tx.Put("branch_phones", next, next.Version); e != nil {
		return e
	}
	old.Data = core.Data(branchPhone{})
	_, e = tx.Put("branch_phones", old, old.Version)
	return e
}
