package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"time"
)

var errBranchPhoneTaken = errors.New("该手机号已绑定其他分公司")

// Only a server-verified phone can claim a branch created by the super admin.
// Keep the original tree node, so descendants and commission history survive.
func bindVerifiedBranch(tx store.Transaction, user, phone string) error {
	mapping, e := tx.Get("branch_phones", phone)
	if errors.Is(e, core.ErrNotFound) {
		return nil
	}
	if e != nil {
		return e
	}
	var binding branchPhone
	if e = json.Unmarshal(mapping.Data, &binding); e != nil {
		return e
	}
	if binding.PartnerID == "" {
		return nil
	}
	if binding.UserID != "" {
		if binding.UserID != user {
			previous, e := tx.Get("users", binding.UserID)
			if e != nil {
				return e
			}
			var status struct {
				Archived bool `json:"archived"`
			}
			if e = json.Unmarshal(previous.Data, &status); e != nil {
				return e
			}
			// A deleted user releases the phone, never the old branch authority.
			if status.Archived {
				return nil
			}
			return errIdentityMerge
		}
		return nil // Never undo an explicit administrator unbind on later logins.
	}
	if _, _, e = store.LockWallet(tx, user); e != nil {
		return e
	}
	if e = partners.Lock(tx); e != nil {
		return e
	}
	partner, e := tx.Get("partners", binding.PartnerID)
	if e != nil {
		return e
	}
	var p core.Partner
	if e = json.Unmarshal(partner.Data, &p); e != nil {
		return e
	}
	if p.Role != core.RoleBranch || p.Status != "active" {
		return core.ErrPartnerDisabled
	}
	if p.OwnerUser != "" && p.OwnerUser != user {
		return errIdentityMerge
	}
	owner, e := tx.Lock("partner_owners", core.Record{ID: user, Owner: user, Data: core.Data(core.PartnerOwner{})})
	if e != nil {
		return e
	}
	var current core.PartnerOwner
	if e = json.Unmarshal(owner.Data, &current); e != nil {
		return e
	}
	if current.PartnerID != "" && current.PartnerID != partner.ID {
		return errIdentityMerge
	}
	if membership, e := tx.Get("memberships", user); e == nil {
		var m core.Membership
		if e = json.Unmarshal(membership.Data, &m); e != nil {
			return e
		}
		if m.Status == "active" || m.Status == "pending" || m.Status == "disabled" {
			return errIdentityMerge
		}
	} else if !errors.Is(e, core.ErrNotFound) {
		return e
	}
	if pointer, e := tx.Get("partner_bind_codes", partner.ID); e == nil {
		var v core.PartnerShare
		if e = json.Unmarshal(pointer.Data, &v); e != nil {
			return e
		}
		if v.User != "" && v.User != user {
			return errIdentityMerge
		}
	} else if !errors.Is(e, core.ErrNotFound) {
		return e
	}
	profile, e := tx.Get("users", user)
	if e != nil {
		return e
	}
	var data map[string]any
	if e = json.Unmarshal(profile.Data, &data); e != nil {
		return e
	}
	if data["verifiedPhone"] != phone || data["phone"] != phone {
		return errPhoneUnverified
	}
	if data["name"] == nil || data["name"] == "" {
		data["name"] = p.Name
		profile.Data = core.Data(data)
		if _, e = tx.Put("users", profile, profile.Version); e != nil {
			return e
		}
	}
	if binding.AccountID != "" {
		accountRow, e := tx.Lock("admin_accounts", core.Record{ID: binding.AccountID})
		if e != nil {
			return e
		}
		var account core.AdminAccount
		if e = json.Unmarshal(accountRow.Data, &account); e != nil {
			return e
		}
		if account.Disabled || account.Archived {
			return core.ErrUserDisabled
		}
		if account.PartnerID != partner.ID || account.Phone != phone {
			return errIdentityMerge
		}
		if e = linkAdminIdentity(tx, &account, accountRow.ID, phone, user); e != nil {
			return e
		}
		accountRow.Data = core.Data(account)
		if _, e = tx.Put("admin_accounts", accountRow, accountRow.Version); e != nil {
			return e
		}
	}
	if e = partners.RecordPhoneOwner(tx, user, partner.ID); e != nil {
		return e
	}
	binding.UserID = user
	mapping.Data = core.Data(binding)
	if _, e = tx.Put("branch_phones", mapping, mapping.Version); e != nil {
		return e
	}
	_, e = tx.Put("partner_audit", core.Record{ID: core.NewID(), Owner: partner.ID, Data: core.Data(map[string]any{"kind": "phone_bind_branch", "actor": "user:" + user, "reason": "验证预绑定手机号后自动关联分公司", "data": map[string]any{"userId": user, "at": time.Now().UTC()}})}, 0)
	return e
}
