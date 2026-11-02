package relay

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
)

type catalogEntry struct {
	ID                string          `json:"id"`
	Name              string          `json:"name"`
	Modality          string          `json:"modality"`
	CreditCost        float64         `json:"credit_cost"`
	Operations        []string        `json:"operations"`
	ResolutionOptions []string        `json:"resolution_options"`
	Schema            json.RawMessage `json:"params_schema"`
	Prices            json.RawMessage `json:"price_modifiers"`
}

type Schema struct {
	Modes            []string                   `json:"modes"`
	Aspect           []string                   `json:"aspect"`
	Resolution       []string                   `json:"resolution"`
	Quality          []string                   `json:"quality"`
	Duration         []string                   `json:"duration"`
	DurationStrict   bool                       `json:"duration_strict"`
	EditImages       struct{ Min, Max int }     `json:"edit_images"`
	RefLimits        map[string]json.RawMessage `json:"ref_limits"`
	ResolutionByMode map[string][]string        `json:"resolution_by_mode"`
}

func (c *Client) Catalog(ctx context.Context) ([]core.Model, error) {
	raw, err := c.Do(ctx, "GET", "/v1/models", nil)
	if err != nil {
		return nil, err
	}
	var rows []catalogEntry
	if json.Unmarshal(raw, &rows) != nil {
		var envelope struct {
			Data []catalogEntry `json:"data"`
		}
		if json.Unmarshal(raw, &envelope) != nil {
			return nil, fmt.Errorf("上游模型目录格式无效")
		}
		rows = envelope.Data
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("上游目录为空，保留现有配置")
	}
	out := make([]core.Model, 0, len(rows))
	seen := map[string]bool{}
	for i, r := range rows {
		if r.ID == "" || seen[r.ID] || len(r.ID) > 240 {
			return nil, fmt.Errorf("上游模型标识无效或重复")
		}
		seen[r.ID] = true
		var schema Schema
		if len(r.Schema) > 0 && json.Unmarshal(r.Schema, &schema) != nil {
			return nil, fmt.Errorf("上游参数格式无效：%s", r.ID)
		}
		if r.Name == "" {
			r.Name = r.ID
		}
		if r.Modality == "text" {
			r.Modality = "chat"
		}
		if len(schema.Resolution) == 0 {
			schema.Resolution = r.ResolutionOptions
		}
		durations := []int{}
		for _, d := range schema.Duration {
			if n, e := strconv.Atoi(strings.TrimSuffix(d, "s")); e == nil && n > 0 && n <= 600 {
				durations = append(durations, n)
			}
		}
		// Relay's non-strict [min,max] definition is an inclusive range.
		if !schema.DurationStrict && len(durations) == 2 && durations[1] > durations[0] {
			min, max := durations[0], durations[1]
			durations = nil
			for n := min; n <= max; n++ {
				durations = append(durations, n)
			}
		}
		slices.Sort(durations)
		refs := []string{}
		if slices.Contains(schema.Modes, "i2i") || slices.Contains(schema.Modes, "i2v") {
			refs = append(refs, "image")
		}
		if r.Modality == "video" && slices.Contains(schema.Modes, "omni_ref") {
			for _, typ := range []string{"video", "audio"} {
				max := 1
				if raw, ok := schema.RefLimits[typ]; ok {
					_ = json.Unmarshal(raw, &max)
				}
				if max > 0 {
					refs = append(refs, typ)
				}
			}
		}
		out = append(out, core.Model{ReferenceTypes: refs, ID: core.Digest(r.ID)[:32], Key: r.ID, Name: r.Name, Kind: r.Modality,
			Available: true, Sort: i, Points: r.CreditCost, CreditCost: r.CreditCost, Resolutions: nonNil(schema.Resolution),
			Ratios: nonNil(schema.Aspect), Durations: durations, Qualities: nonNil(schema.Quality), Modes: nonNil(schema.Modes),
			Operations: nonNil(r.Operations), ParamsSchema: r.Schema, PriceModifiers: r.Prices, SyncedAt: time.Now().UTC().Format(time.RFC3339)})
	}
	return out, nil
}
func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
