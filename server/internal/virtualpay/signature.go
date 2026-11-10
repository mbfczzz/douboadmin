package virtualpay

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"time"
)

// Issuing a signed order is a one-way transition: never reuse its outTradeNo.
func (s *Service) ClaimSignature(ctx context.Context, id string) error {
	base, err := s.Store.Get(ctx, "orders", id)
	if err != nil {
		return err
	}
	if base.Owner == "" {
		return core.ErrPaymentMismatch
	}
	requireActivation := s.Billing != nil && s.Billing.RequireActivation
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, err := store.LockWallet(tx, base.Owner); err != nil {
			return err
		}
		if s.Billing != nil && s.Billing.BeforePayment != nil {
			if err := s.Billing.BeforePayment(tx); err != nil {
				return err
			}
		}
		access, err := partners.AuthorizePayment(tx, base.Owner, requireActivation)
		if err != nil {
			return err
		}
		r, err := tx.Lock("orders", core.Record{ID: id})
		if err != nil {
			return err
		}
		var o core.Order
		if json.Unmarshal(r.Data, &o) != nil || o.Channel != Channel || o.Virtual == nil || o.Status != "created" || !o.ExpiresAt.After(time.Now()) {
			return core.ErrConflict
		}
		if r.Owner != base.Owner || o.UserID != base.Owner {
			return core.ErrPaymentMismatch
		}
		if err = validateSnapshot(o); err != nil {
			return err
		}
		if requireActivation && !partners.SameOrderPartner(access, o) {
			return fmt.Errorf("%w: 授权归属已变化，请重新下单", core.ErrConflict)
		}
		if o.Virtual.Issued {
			return fmt.Errorf("%w: 支付单号已使用，请查询结果或创建新订单", core.ErrConflict)
		}
		o.Virtual.Issued = true
		r.Data = core.Data(o)
		_, err = tx.Put("orders", r, r.Version)
		return err
	})
}
