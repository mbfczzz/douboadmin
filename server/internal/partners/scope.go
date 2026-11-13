package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"slices"
)

// Subtree returns the provider itself and every descendant at any depth.
func (s *Service) Subtree(ctx context.Context, root string) ([]string, error) {
	rows, err := store.AllRecords(ctx, s.Store, "partners", "")
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for _, row := range rows {
		var p core.Partner
		if json.Unmarshal(row.Data, &p) != nil {
			continue
		}
		if p.Status != "deleted" && (row.ID == root || slices.Contains(p.Path, root)) {
			ids = append(ids, row.ID)
		}
	}
	return ids, nil
}

// Active reports core.ErrPartnerDisabled when the provider or any ancestor is disabled.
func (s *Service) Active(ctx context.Context, id string) error {
	return activeChain(reader{ctx, s.Store}, id)
}

// Replay returns the stored result of an already completed idempotent command.
func (s *Service) Replay(ctx context.Context, actor, key string) (core.Record, bool, error) {
	if len(key) < 8 || len(key) > 128 {
		return core.Record{}, false, nil
	}
	row, err := s.Store.Get(ctx, "partner_commands", core.Digest(actor + ":" + key)[:32])
	if errors.Is(err, core.ErrNotFound) {
		return core.Record{}, false, nil
	}
	if err != nil {
		return core.Record{}, false, err
	}
	var saved struct {
		Result core.Record `json:"result"`
	}
	if err = json.Unmarshal(row.Data, &saved); err != nil {
		return core.Record{}, false, err
	}
	return saved.Result, true, nil
}
