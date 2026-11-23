package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

// ActivateDirect opens an enabled, fully registered account without creating
// a provider relationship. Existing pending or active relationships win.
func (s *Service) ActivateDirect(ctx context.Context, user string) (out core.Access, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		if e := Lock(tx); e != nil {
			return e
		}
		if _, e := enabledProfile(tx, user); e != nil {
			return e
		}
		current, e := access(tx, user)
		if e != nil {
			return e
		}
		if current.Active {
			out = current
			return nil
		}
		if current.Status == "review" || current.Status == "disabled" || current.Status == "provider_disabled" {
			return rulef("当前账号已有待审核或停用的服务商登记，不能直接注册")
		}
		_, e = tx.Put("direct_access", core.Record{ID: user, Owner: user, Data: core.Data(core.DirectAccess{ActivatedAt: nowUTC()})}, 0)
		if errors.Is(e, core.ErrConflict) {
			e = nil
		}
		out = core.Access{Active: true, Status: "direct"}
		return e
	})
	return
}
