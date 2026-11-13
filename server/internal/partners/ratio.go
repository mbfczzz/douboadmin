package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"slices"
)

var ErrRatioAccess = errors.New("账号或分佣权限已变化，请刷新后重试")

// UpdateRatio performs authorization and the current upstream limit check under
// the same tree lock as the write. No account metadata is accepted by this method.
func (s *Service) UpdateRatio(ctx context.Context, id string, margin, version int64, actor, owner string) (out core.Record, err error) {
	if owner == "" || owner == core.RootPartner || id == owner || margin < 0 || margin > 10000 {
		return out, rulef("只能调整下级的有效分佣比例")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		login, e := tx.Lock("admin_accounts", core.Record{ID: actor})
		if e != nil {
			return e
		}
		var account core.AdminAccount
		if json.Unmarshal(login.Data, &account) != nil || account.Disabled || account.Archived || account.PartnerID != owner {
			return ErrRatioAccess
		}
		if e = activeChain(tx, owner); e != nil {
			return e
		}
		_, own, e := node(tx, owner)
		if e != nil {
			return e
		}
		row, current, e := node(tx, id)
		if e != nil {
			return e
		}
		if row.Version != version {
			return core.ErrConflict
		}
		if !slices.Contains(current.Path, owner) {
			return ErrRatioAccess
		}
		if margin > current.ChildMarginBps && margin > own.ChildMarginBps {
			return rulef("下级的向下比例不能高于本服务商")
		}
		current.ChildMarginBps = margin
		out, e = tx.Put("partners", core.Record{ID: id, Owner: row.Owner, Data: core.Data(current)}, version)
		if e != nil {
			return e
		}
		if _, e = prices(tx, id); e != nil {
			return e
		}
		return audit(tx, id, "update_partner", actor, "调整下级分佣比例", current)
	})
	return
}
