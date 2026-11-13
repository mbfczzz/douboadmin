package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

// RecordPhoneOwner uses the same binding pointer as manual binding so the
// super admin can inspect and revoke it. The caller holds wallet/tree locks.
func RecordPhoneOwner(tx store.Transaction, user, partner string) error {
	pointer, v, e := get[core.PartnerShare](tx, pointers[BindCode], partner)
	if errors.Is(e, core.ErrNotFound) {
		pointer = core.Record{}
		e = nil
	}
	if e != nil {
		return e
	}
	if v.User != "" && v.User != user {
		return rulef("分公司已绑定其他用户")
	}
	if v.Code == "" {
		v, e = issueShare(tx, partner, core.ShareCode{PartnerID: partner, Kind: BindCode, Actor: "phone-binding"}, pointer, v)
		if e != nil {
			return e
		}
		pointer, _, e = get[core.PartnerShare](tx, pointers[BindCode], partner)
		if e != nil {
			return e
		}
	}
	v.User = user
	if _, e = put(tx, pointers[BindCode], pointer, v); e != nil {
		return e
	}
	if e = retireCode(tx, v.Code); e != nil {
		return e
	}
	if e = approvePhoneBindRegistration(tx, user, partner); e != nil {
		return e
	}
	return setOwner(tx, user, partner, "active")
}

func approvePhoneBindRegistration(tx store.Transaction, user, partner string) error {
	row, reg, e := get[core.Registration](tx, "registrations", user)
	if errors.Is(e, core.ErrNotFound) || (e == nil && reg.Status != "pending") {
		return nil
	}
	if e != nil {
		return e
	}
	if reg.PartnerID != partner || reg.CodeKind != BindCode {
		return rulef("存在其他待审核归属，请先由超级管理员核对")
	}
	now := nowUTC()
	reg.Status, reg.DecidedBy, reg.DecidedAt = "approved", "phone-binding", &now
	reg.Reason = "验证超级管理员预留手机号后直接开通"
	if _, e = put(tx, "registrations", row, reg); e != nil {
		return e
	}
	return saveCodeUse(tx, user, reg)
}
