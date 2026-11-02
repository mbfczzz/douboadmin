package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"log/slog"
	"time"
)

func (s *Service) Expire(ctx context.Context) error {
	rows, e := s.Store.ExpiredActivationCodes(ctx, 100)
	if e != nil {
		return e
	}
	for _, item := range rows {
		e = s.Store.Atomic(ctx, func(tx store.Transaction) error {
			if e := Lock(tx); e != nil {
				return e
			}
			row, v, e := get[core.ActivationCode](tx, "activation_codes", item.ID)
			if e != nil {
				return e
			}
			if v.Status != "pending" || v.ExpiresAt.After(time.Now()) {
				return nil
			}
			return cancelCode(tx, row, v, "expired", "system")
		})
		if e != nil {
			return e
		}
	}
	return nil
}
func (s *Service) Run(ctx context.Context) {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		check, cancel := context.WithTimeout(ctx, 20*time.Second)
		e := s.Expire(check)
		cancel()
		if e != nil && ctx.Err() == nil {
			slog.Warn("activation code expiry failed", "error", e)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
