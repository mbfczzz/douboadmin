package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"math"
	"slices"
)

func publicReferenceRules(m core.Model) map[string]map[string]core.ReferenceRule {
	var schema relay.Schema
	_ = json.Unmarshal(m.ParamsSchema, &schema)
	out := map[string]map[string]core.ReferenceRule{}
	for _, mode := range m.Modes {
		if mode != "i2i" && mode != "i2v" && mode != "keyframe" && mode != "omni_ref" {
			continue
		}
		rules := map[string]core.ReferenceRule{}
		for _, typ := range m.ReferenceTypes {
			if mode != "omni_ref" && typ != "image" {
				continue
			}
			if mode == "omni_ref" {
				if enabled, ok := m.Settings.OmniReferences[typ]; ok && !enabled {
					continue
				}
			}
			rule := core.ReferenceRule{MaxCount: 20, MaxSizeMB: 50}
			prefix := mode
			if mode == "omni_ref" {
				prefix = "omniRef"
			}
			count, size := m.Settings.RefLimits[prefix+"."+typ+"Count"], m.Settings.RefLimits[prefix+"."+typ+"SizeMB"]
			if m.Kind == "image" {
				rule.MinCount = max(1, schema.EditImages.Min)
				count = float64(m.Settings.MaxRefImages)
				size = m.Settings.MaxRefImageSizeMB
				if schema.EditImages.Max > 0 {
					rule.MaxCount = min(rule.MaxCount, schema.EditImages.Max)
				}
			}
			if mode == "i2v" {
				rule.MaxCount = 1
				rule.MinCount = 1
			}
			if mode == "keyframe" {
				rule.MaxCount = 2
				rule.MinCount = 2
			}
			if mode == "omni_ref" {
				if limit, ok := schema.RefLimit(typ); ok {
					rule.MaxCount = min(rule.MaxCount, limit)
				}
			}
			// The operator's count is the limit (as validateModelReferences
			// checks on submit), above the relay's declaration too: a relay
			// may declare fewer than its upstream takes. i2v and keyframe
			// stay fixed by their mode.
			if count > 0 && (mode == "i2i" || mode == "omni_ref") {
				rule.MaxCount = min(int(count), 20)
			}
			if size > 0 {
				rule.MaxSizeMB = math.Min(rule.MaxSizeMB, size)
			}
			if mode == "omni_ref" && typ == "video" {
				rule.MaxSeconds = core.RefVideoSeconds(m)
			}
			rules[typ] = rule
		}
		out[mode] = rules
	}
	return out
}

func publicModeResolutions(m core.Model) map[string][]string {
	// Explicit admin options override the relay's narrower per-mode declaration.
	if m.Kind == "image" || m.Kind == "video" || len(m.Settings.Resolutions) > 0 {
		return nil
	}
	var schema relay.Schema
	_ = json.Unmarshal(m.ParamsSchema, &schema)
	out := map[string][]string{}
	for _, mode := range m.Modes {
		allowed := schema.ResolutionByMode[mode]
		if len(allowed) == 0 {
			continue
		}
		values := []string{}
		for _, v := range allowed {
			if len(m.Resolutions) == 0 || slices.Contains(m.Resolutions, v) {
				values = append(values, v)
			}
		}
		out[mode] = values
	}
	return out
}
