package llm

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

// Provider is one configured chat provider: its client and listed model IDs.
type Provider struct {
	Name   string // "deepseek" or "ark"
	Label  string // shown in model names: "DeepSeek", "豆包"
	Client *Client
	Models []string
	// Default 按量 prices (points per 1,000 tokens) for newly listed models.
	InputPrice, OutputPrice float64
}

// ModelID is the catalog ID of a directly-called chat model.
func ModelID(provider, model string) string { return core.Digest("direct:" + provider + ":" + model)[:32] }

// EnsureModels lists each configured model in 模型管理. New ones start
// published with the default prices; existing ones keep every operator
// setting and only follow whether the provider is configured and still lists
// them. Models of a provider no longer listed become unavailable.
func EnsureModels(ctx context.Context, s store.Store, providers []Provider) error {
	listed := map[string]bool{}
	for _, p := range providers {
		for i, id := range p.Models {
			key := p.Name + ":" + id
			listed[key] = true
			// The API and worker processes both start this; a lost race is fine.
			if err := ensure(ctx, s, p, key, id, i, p.Client.Ready()); err != nil && !errors.Is(err, core.ErrConflict) {
				return err
			}
		}
	}
	rows, err := store.AllRecords(ctx, s, "models", "")
	if err != nil {
		return err
	}
	for _, row := range rows {
		var m core.Model
		if json.Unmarshal(row.Data, &m) != nil || listed[m.Key] || !m.Available {
			continue
		}
		if _, _, direct := core.DirectChat(m.Key); direct {
			m.Available = false
			if _, err = s.Put(ctx, "models", core.Record{ID: row.ID, Data: core.Data(m)}, row.Version); err != nil && !errors.Is(err, core.ErrConflict) {
				return err
			}
		}
	}
	return nil
}

func ensure(ctx context.Context, s store.Store, p Provider, key, id string, order int, ready bool) error {
	modelID := ModelID(p.Name, id)
	row, err := s.Get(ctx, "models", modelID)
	if err == nil {
		var m core.Model
		if json.Unmarshal(row.Data, &m) != nil || m.Available == ready {
			return nil
		}
		m.Available = ready
		_, err = s.Put(ctx, "models", core.Record{ID: modelID, Data: core.Data(m)}, row.Version)
		return err
	}
	if !errors.Is(err, core.ErrNotFound) {
		return err
	}
	refs := []string{}
	if p.Name == "ark" {
		refs = []string{"image"} // 豆包 reads pictures; DeepSeek does not
	}
	m := core.Model{ID: modelID, Key: key, Name: p.Label + " " + id, Kind: "chat", Published: true, Available: ready, Sort: 900 + order,
		ReferenceTypes: refs, Resolutions: []string{}, Ratios: []string{}, Durations: []int{}, Qualities: []string{}, Modes: []string{}, Operations: []string{},
		Settings: core.ModelSettings{TokenInputPrice: p.InputPrice, TokenOutputPrice: p.OutputPrice, Description: p.Label + " 对话模型，按 token 计费"}}
	_, err = s.Put(ctx, "models", core.Record{ID: modelID, Data: core.Data(m)}, 0)
	return err
}
