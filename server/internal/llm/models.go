package llm

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"strings"
)

// Provider is one configured chat provider: its client and listed model IDs.
type Provider struct {
	Name   string // "deepseek" or "ark"
	Label  string // shown in model names: "DeepSeek", "豆包"
	Client *Client
	Models []string
	// Default 按量 prices (points per 1,000 tokens) for newly listed models;
	// CachedPrice nil charges cache hits at the input price.
	InputPrice, OutputPrice float64
	CachedPrice             *float64
	PeakRate                float64
	// ModelPrices overrides the defaults for a listed model ID: input,
	// cache hit, output (deepseek-v4-pro costs more than Flash).
	ModelPrices map[string][3]float64
	// Seeing lists the model IDs (substrings) that read pictures, when not
	// all of the provider's models do.
	Seeing []string
	// Names gives a listed model ID a readable name ("DeepSeek Pro").
	Names map[string]string
	// Tagline describes a model in the Agent's model picker (by model ID,
	// "" for the provider's others).
	Tagline map[string]string
	// Previous are the input / output defaults before these: a model still
	// at them (never repriced by an operator) moves to the new prices.
	Previous [2]float64
}

// ModelID is the catalog ID of a directly-called chat model.
func ModelID(provider, model string) string {
	return core.Digest("direct:" + provider + ":" + model)[:32]
}

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
		if json.Unmarshal(row.Data, &m) != nil {
			return nil
		}
		repriced := reprice(&m.Settings, p, id)
		// An earlier default, never edited, follows the current tagline.
		if d := m.Settings.Description; d != tagline(p, id) && (d == p.Label+" 对话模型，按 token 计费" || d == "反应快、价格低，写脚本和方案的首选，也能看图" || d == "推理更强，适合复杂策划；不能看图") {
			m.Settings.Description, repriced = tagline(p, id), true
		}
		if m.Available == ready && !repriced {
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
	if sees(p, id) {
		refs = []string{"image"}
	}
	settings := core.ModelSettings{TokenInputPrice: p.InputPrice, TokenOutputPrice: p.OutputPrice, TokenCachedPrice: p.CachedPrice, PeakPriceRate: p.PeakRate,
		Description: tagline(p, id)}
	if price, ok := p.ModelPrices[id]; ok {
		hit := price[1]
		settings.TokenInputPrice, settings.TokenCachedPrice, settings.TokenOutputPrice = price[0], &hit, price[2]
	}
	name := p.Label // the first listed model carries just the provider's name
	if order > 0 {
		name += " " + id
	}
	if n := p.Names[id]; n != "" {
		name = n
	}
	m := core.Model{ID: modelID, Key: key, Name: name, Kind: "chat", Published: true, Available: ready, Sort: 900 + order,
		ReferenceTypes: refs, Resolutions: []string{}, Ratios: []string{}, Durations: []int{}, Qualities: []string{}, Modes: []string{}, Operations: []string{},
		Settings: settings}
	_, err = s.Put(ctx, "models", core.Record{ID: modelID, Data: core.Data(m)}, 0)
	return err
}

// reprice moves a model still at the previous default prices (and without
// cache or peak prices, added later) to the current defaults.
func reprice(s *core.ModelSettings, p Provider, id string) bool {
	if p.Previous == [2]float64{} || s.TokenInputPrice != p.Previous[0] || s.TokenOutputPrice != p.Previous[1] || s.TokenCachedPrice != nil || s.PeakPriceRate != 0 {
		return false
	}
	in, hit, out := p.InputPrice, p.CachedPrice, p.OutputPrice
	if price, ok := p.ModelPrices[id]; ok { // e.g. deepseek-v4-pro costs more than Flash
		in, hit, out = price[0], &price[1], price[2]
	}
	s.TokenInputPrice, s.TokenOutputPrice, s.TokenCachedPrice, s.PeakPriceRate = in, out, hit, p.PeakRate
	return true
}

// sees: 豆包 models read pictures; of DeepSeek's, the Flash models do.
func sees(p Provider, id string) bool {
	if len(p.Seeing) == 0 {
		return p.Name == "ark"
	}
	for _, s := range p.Seeing {
		if strings.Contains(id, s) {
			return true
		}
	}
	return false
}

func tagline(p Provider, id string) string {
	if t, ok := p.Tagline[id]; ok {
		return t
	}
	if t := p.Tagline[""]; t != "" {
		return t
	}
	return p.Label + " 对话模型"
}
