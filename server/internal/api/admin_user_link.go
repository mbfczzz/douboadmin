package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

// Linking grants no additional permissions: this is an existing, super-managed
// backend credential attached to the unique user record.
func (a *Server) linkAdminUser(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Phone   string `json:"phone"`
		Version int64  `json:"version"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Phone = strings.TrimSpace(input.Phone)
	if !mainlandPhone.MatchString(input.Phone) {
		fail(w, 400, "请输入11位手机号")
		return
	}
	candidate, err := a.phoneCandidate(r.Context(), input.Phone)
	if err != nil {
		dbError(w, err)
		return
	}
	var result core.Record
	err = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		if e := lockIdentity(tx); e != nil {
			return e
		}
		row, e := tx.Lock("admin_accounts", core.Record{ID: r.PathValue("id")})
		if e != nil {
			return e
		}
		var account core.AdminAccount
		if e = json.Unmarshal(row.Data, &account); e != nil {
			return e
		}
		if row.Version != input.Version {
			return core.ErrConflict
		}
		if account.Archived {
			return core.ErrUserDisabled
		}
		if e = linkAdminIdentity(tx, &account, row.ID, input.Phone, candidate); e != nil {
			return e
		}
		row.Data = core.Data(account)
		result, e = tx.Put("admin_accounts", row, input.Version)
		return e
	})
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, a.adminView(r.Context(), result))
}

func (a *Server) syncAdminPhone(ctx context.Context, account *core.AdminAccount) error {
	if account.UserID == "" {
		return nil
	}
	row, err := a.Store.Get(ctx, "users", account.UserID)
	if err != nil {
		return err
	}
	var profile struct {
		Phone string `json:"phone"`
	}
	if err = json.Unmarshal(row.Data, &profile); err != nil {
		return err
	}
	account.Phone = profile.Phone
	return nil
}

func linkAdminIdentity(tx store.Transaction, account *core.AdminAccount, accountID, phone, candidate string) error {
	owner, e := tx.Lock("phone_owners", core.Record{ID: phone, Data: core.Data(phoneOwner{})})
	if e != nil {
		return e
	}
	var reservation phoneOwner
	if e = json.Unmarshal(owner.Data, &reservation); e != nil {
		return e
	}
	user := reservation.User
	if user == "" {
		user = candidate
	}
	if user == "" {
		user = core.NewID()
	}
	if account.UserID != "" && account.UserID != user {
		return errIdentityMerge
	}
	profile, e := tx.Get("users", user)
	if errors.Is(e, core.ErrNotFound) {
		profile, e = putUniqueUser(tx, core.Record{ID: user, Owner: user, Data: core.Data(map[string]any{
			"phone": phone, "name": account.Name, "nickname": account.Name, "source": "other", "sources": []string{"other"}, "preprovisioned": true,
		})}, 0)
	}
	if e != nil {
		return e
	}
	var data map[string]any
	if e = json.Unmarshal(profile.Data, &data); e != nil {
		return e
	}
	if data["archived"] == true || data["disabled"] == true {
		return core.ErrUserDisabled
	}
	if data["verifiedPhone"] != phone && data["preprovisioned"] != true {
		return errPhoneUnverified
	}
	link, e := tx.Lock("admin_user_links", core.Record{ID: user, Owner: user, Data: core.Data(map[string]string{})})
	if e != nil {
		return e
	}
	var prior struct {
		AccountID string `json:"accountId"`
	}
	if e = json.Unmarshal(link.Data, &prior); e != nil {
		return e
	}
	if prior.AccountID != "" && prior.AccountID != accountID {
		other, e := tx.Get("admin_accounts", prior.AccountID)
		if e != nil {
			return e
		}
		var old core.AdminAccount
		if e = json.Unmarshal(other.Data, &old); e != nil {
			return e
		}
		if !old.Archived {
			return errIdentityMerge
		}
	}
	link.Data = core.Data(map[string]string{"accountId": accountID})
	if _, e = tx.Put("admin_user_links", link, link.Version); e != nil {
		return e
	}
	account.UserID, account.Phone = user, phone
	return nil
}

func (a *Server) createLinkedAdmin(ctx context.Context, row core.Record) (core.Record, error) {
	var account core.AdminAccount
	if err := json.Unmarshal(row.Data, &account); err != nil {
		return row, err
	}
	candidate := ""
	var err error
	if account.Phone != "" {
		if !mainlandPhone.MatchString(account.Phone) {
			return row, errPhoneFormat
		}
		candidate, err = a.phoneCandidate(ctx, account.Phone)
		if err != nil {
			return row, err
		}
	}
	err = a.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := lockIdentity(tx); e != nil {
			return e
		}
		if account.Phone != "" {
			if e := linkAdminIdentity(tx, &account, row.ID, account.Phone, candidate); e != nil {
				return e
			}
			row.Data = core.Data(account)
		}
		var e error
		row, e = tx.Put("admin_accounts", row, 0)
		return e
	})
	return row, err
}
