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
				var limit int
				if json.Unmarshal(schema.RefLimits[typ], &limit) == nil && limit > 0 {
					rule.MaxCount = min(rule.MaxCount, limit)
				}
			}
			if count > 0 {
				rule.MaxCount = min(rule.MaxCount, int(count))
			}
			if size > 0 {
				rule.MaxSizeMB = math.Min(rule.MaxSizeMB, size)
			}
			rules[typ] = rule
		}
		out[mode] = rules
	}
	return out
}

func publicModeResolutions(m core.Model) map[string][]string {
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
