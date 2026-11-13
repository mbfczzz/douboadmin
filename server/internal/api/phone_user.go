package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"time"
)

// Phone ownership, rather than a device or client-supplied user ID, chooses the account.
// A legacy unverified account must first verify in its original login context.
func (a *Server) resolvePhoneUser(tx store.Transaction, phone, preferred, source string, originalContext bool) (string, bool, error) {
	ownerRow, e := tx.Lock("phone_owners", core.Record{ID: phone, Data: core.Data(phoneOwner{})})
	if e != nil {
		return "", false, e
	}
	var owner phoneOwner
	if json.Unmarshal(ownerRow.Data, &owner) != nil {
		return "", false, errors.New("手机号记录异常")
	}
	id := owner.User
	if id == "" {
		id = preferred
	}
	if id == "" {
		id = core.NewID()
	}
	row, e := tx.Get("users", id)
	fresh := errors.Is(e, core.ErrNotFound)
	if e != nil && !fresh {
		return "", false, e
	}
	profile := map[string]any{}
	if !fresh {
		if json.Unmarshal(row.Data, &profile) != nil {
			return "", false, errors.New("用户资料异常")
		}
	} else {
		row = core.Record{ID: id, Owner: id}
		profile["nickname"] = "手机用户"
		profile["authProvider"] = "phone"
		if source == "miniprogram" {
			profile["authProvider"] = "wechat"
		}
	}
	if profile["disabled"] == true || profile["archived"] == true {
		return "", false, core.ErrUserDisabled
	}
	if current := inputPhone(profile); current != "" && current != phone {
		return "", false, errPhoneConflict
	}
	if !fresh && profile["verifiedPhone"] != phone && !originalContext && profile["preprovisioned"] != true {
		return "", false, errPhoneUnverified
	}
	profile["phone"], profile["verifiedPhone"] = phone, phone
	profile["phoneVerifiedAt"] = time.Now().UTC().Format(time.RFC3339)
	delete(profile, "preprovisioned")
	userSource(profile, source)
	row.Data = core.Data(profile)
	if _, e = putUniqueUser(tx, row, row.Version); e != nil {
		return "", false, e
	}
	return id, fresh, nil
}
