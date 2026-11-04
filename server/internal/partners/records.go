package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

type Service struct{ Store store.Store }
type Reader interface {
	Get(string, string) (core.Record, error)
}
type reader struct {
	ctx context.Context
	s   store.Store
}

func (r reader) Get(ns, id string) (core.Record, error) { return r.s.Get(r.ctx, ns, id) }

// All partner operations take this shared lock. Financial callers lock the user wallet first.
func Lock(tx store.Transaction) error {
	return lockControl(tx)
}
func get[T any](r Reader, ns, id string) (core.Record, T, error) {
	row, e := r.Get(ns, id)
	var v T
	if e == nil {
		e = json.Unmarshal(row.Data, &v)
	}
	return row, v, e
}
func put[T any](tx store.Transaction, ns string, row core.Record, v T) (core.Record, error) {
	row.Data = core.Data(v)
	return tx.Put(ns, row, row.Version)
}
func policy(r Reader) (core.Record, core.DistributionPolicy, error) {
	row, v, e := get[core.DistributionPolicy](r, "settings", "distribution")
	if errors.Is(e, core.ErrNotFound) {
		return core.Record{ID: "distribution"}, core.DefaultDistributionPolicy(), nil
	}
	return row, v, e
}
func node(r Reader, id string) (core.Record, core.Partner, error) {
	if id == core.RootPartner {
		row, p, e := policy(r)
		return core.Record{ID: id, Version: row.Version}, core.Partner{Name: "总账号", Status: "active", RetailPer100Fen: 10000, ChildMarginBps: p.RootMarginBps}, e
	}
	return get[core.Partner](r, "partners", id)
}
func quota(tx store.Transaction, id string) (core.Record, core.PartnerQuota, error) {
	row, v, e := get[core.PartnerQuota](tx, "partner_quotas", id)
	if errors.Is(e, core.ErrNotFound) {
		return core.Record{ID: id, Owner: id}, v, nil
	}
	return row, v, e
}
func ensure(pool *core.QuotaPool, auto bool, n int64) error {
	if n < 0 || n > 1000000 {
		return rulef("名额数量无效")
	}
	if pool.Available() < n {
		if !auto {
			return core.ErrQuota
		}
		pool.Granted += n - pool.Available()
	}
	return nil
}
func legacyRootQuota(r Reader, id string) bool {
	if id != core.RootPartner {
		return false
	}
	_, value, err := policy(r)
	return err == nil && value.TotalUserQuota == 0
}
func audit(tx store.Transaction, owner, kind, actor, reason string, data any) error {
	_, e := tx.Put("partner_audit", core.Record{ID: core.NewID(), Owner: owner, Data: core.Data(map[string]any{"kind": kind, "actor": actor, "reason": reason, "data": data})}, 0)
	return e
}
func activeChain(r Reader, id string) error {
	seen := map[string]bool{}
	for depth := 0; id != core.RootPartner; depth++ {
		if depth >= 8 || id == "" || seen[id] {
			return rulef("服务商层级异常")
		}
		seen[id] = true
		_, p, e := node(r, id)
		if e != nil {
			return e
		}
		if p.Status != "active" {
			return core.ErrPartnerDisabled
		}
		id = p.ParentID
	}
	return nil
}
