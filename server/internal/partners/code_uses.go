package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

func unusedCode(tx store.Transaction, user, code string) error {
	if _, e := tx.Get("code_uses", core.CodeUseID(user, code)); e == nil {
		return rulef("你已使用过这个二维码，不能重复登记，请获取其他二维码")
	} else if !errors.Is(e, core.ErrNotFound) {
		return e
	}
	// This also protects legacy registrations created before the new table.
	if _, old, e := get[core.Registration](tx, "registrations", user); e == nil && old.Code == code {
		return rulef("你已使用过这个二维码，不能重复登记，请获取其他二维码")
	} else if e != nil && !errors.Is(e, core.ErrNotFound) {
		return e
	}
	return nil
}

func saveCodeUse(tx store.Transaction, user string, reg core.Registration) error {
	if reg.Code == "" {
		return nil
	} // legacy registration without a recoverable code
	row, old, e := get[core.CodeUse](tx, "code_uses", core.CodeUseID(user, reg.Code))
	if errors.Is(e, core.ErrNotFound) {
		_, code, err := get[core.ShareCode](tx, "share_codes", reg.Code)
		if err != nil {
			return err
		}
		row, e = core.Record{ID: core.CodeUseID(user, reg.Code), Owner: code.PartnerID, CreatedAt: reg.RegisteredAt}, nil
	}
	if e != nil {
		return e
	}
	nickname := old.Nickname
	if nickname == "" {
		if _, profile, err := get[userProfile](tx, "users", user); err == nil {
			nickname = profile.Nickname
		}
	}
	_, e = put(tx, "code_uses", row, core.CodeUseFromRegistration(user, nickname, reg))
	return e
}
