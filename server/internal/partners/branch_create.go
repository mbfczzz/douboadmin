package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
)

// CreateConfiguredBranch commits the branch and its identity configuration as
// one idempotent operation. before establishes identity-before-tree lock order.
func (s *Service) CreateConfiguredBranch(ctx context.Context, name, phone, key, actor string, fingerprint any, before func(store.Transaction) error, configure func(store.Transaction, core.Record) error) (core.Record, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 60 {
		return core.Record{}, rulef("服务商名称需为 1–60 字")
	}
	return s.commandBefore(ctx, actor, key, []any{"branch-phone", name, phone, fingerprint}, before, func(tx store.Transaction, id string) (core.Record, error) {
		row, e := createChild(tx, id, core.RootPartner, core.Partner{Name: name, Phone: phone, Role: core.RoleBranch, Status: "active"}, actor)
		if e != nil {
			return row, e
		}
		if e = configure(tx, row); e != nil {
			return row, e
		}
		return row, nil
	})
}
