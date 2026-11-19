package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
)

// Every nonempty phone is reserved by one user, including profiles awaiting
// verification. Reservation does not prove ownership; verifiedPhone does.
type phoneOwner struct {
	User string `json:"user"`
}

const errPhoneTaken = "该手机号已被其他账号使用"

// phoneTaken is the early check before sending a code; claimPhone decides.
func (a *Server) phoneTaken(ctx context.Context, phone, user string) (bool, error) {
	_, o, e := recordOf[phoneOwner](ctx, a.Store, "phone_owners", phone)
	if errors.Is(e, core.ErrNotFound) {
		return false, nil
	}
	return e == nil && o.User != "" && o.User != user, e
}

// claimPhone locks the number's record (creating it if needed) so two
// accounts verifying the same phone at once cannot both win.
func claimPhone(tx store.Transaction, phone, user string) (bool, error) {
	row, e := tx.Lock("phone_owners", core.Record{ID: phone, Data: core.Data(phoneOwner{})})
	if e != nil {
		return false, e
	}
	var o phoneOwner
	if json.Unmarshal(row.Data, &o) != nil {
		return false, fmt.Errorf("手机号记录异常")
	}
	if o.User == user {
		return true, nil
	}
	if active, e := ownerActive(tx, o.User, phone); e != nil || active {
		return false, e
	}
	_, e = tx.Put("phone_owners", core.Record{ID: phone, Data: core.Data(phoneOwner{user})}, row.Version)
	return e == nil, e
}

// ownerActive reports whether a phone_owners entry still names a live
// account that holds this number (as its phone or verified phone). A deleted
// (archived) or missing account, or one whose profile no longer has the
// number, does not hold it even if the release was never recorded (older
// data), so the number can log in or register again. A disabled account that
// still has the number keeps it.
func ownerActive(tx store.Transaction, user, phone string) (bool, error) {
	if user == "" {
		return false, nil
	}
	row, e := tx.Get("users", user)
	if errors.Is(e, core.ErrNotFound) {
		return false, nil
	} else if e != nil {
		return false, e
	}
	var profile map[string]any
	if json.Unmarshal(row.Data, &profile) != nil {
		return true, nil
	}
	verified, _ := profile["verifiedPhone"].(string)
	return profile["archived"] != true && (inputPhone(profile) == phone || verified == phone), nil
}

// releasePhone frees a number the user no longer holds (new phone, archived).
func releasePhone(tx store.Transaction, phone, user string) error {
	if phone == "" {
		return nil
	}
	row, e := tx.Get("phone_owners", phone)
	if errors.Is(e, core.ErrNotFound) {
		return nil
	} else if e != nil {
		return e
	}
	var o phoneOwner
	if json.Unmarshal(row.Data, &o) != nil || o.User != user {
		return nil
	}
	_, e = tx.Put("phone_owners", core.Record{ID: phone, Data: core.Data(phoneOwner{})}, row.Version)
	return e
}
