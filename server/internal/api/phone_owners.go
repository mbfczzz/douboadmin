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
	if o.User != "" {
		return o.User == user, nil
	}
	_, e = tx.Put("phone_owners", core.Record{ID: phone, Data: core.Data(phoneOwner{user})}, row.Version)
	return e == nil, e
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
