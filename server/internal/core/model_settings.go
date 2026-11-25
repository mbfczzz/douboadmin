package core

import (
	"slices"
	"strings"
)

type ModelBadge struct {
	Text string `json:"text"`
	Tone string `json:"tone"`
}
type ErrorHint struct {
	Contains string `json:"contains"`
	Message  string `json:"message"`
}
type ModelSettings struct {
	Description       string             `json:"description,omitempty"`
	Icon              string             `json:"icon,omitempty"`
	CostUSD           string             `json:"costUsd,omitempty"`
	EstSeconds        int                `json:"estSeconds,omitempty"`
	Badges            []ModelBadge       `json:"badges,omitempty"`
	Modes             []string           `json:"modes,omitempty"`
	Resolutions       []string           `json:"resolutions,omitempty"`
	Ratios            []string           `json:"ratios,omitempty"`
	Qualities         []string           `json:"qualities,omitempty"`
	HideQuality       bool               `json:"hideQuality,omitempty"`
	HideResolution    bool               `json:"hideResolution,omitempty"`
	Durations         []int              `json:"durations,omitempty"`
	MaxRefImages      int                `json:"maxRefImages,omitempty"`
	MaxRefImageSizeMB float64            `json:"maxRefImageSizeMB,omitempty"`
	RefLimits         map[string]float64 `json:"refLimits,omitempty"`
	OmniReferences    map[string]bool    `json:"omniReferences,omitempty"`
	DefaultPrompt     string             `json:"defaultPrompt,omitempty"`
	Ideas             []string           `json:"ideas,omitempty"`
	MaxPromptChars    int                `json:"maxPromptChars,omitempty"`
	VideoBillingMode  string             `json:"videoBillingMode,omitempty"`
	// ReferenceVideoBilling charges each 全能参考 video on top of the
	// generation (FlowLight 参考视频计费); see ReferenceVideoUnits.
	ReferenceVideoBilling bool `json:"referenceVideoBillingEnabled,omitempty"`
	// VideoTokenPrices: 火山方舟 Seedance (arkvideo:) is billed on the video
	// tokens it reports; points per million tokens by output resolution.
	VideoTokenPrices map[string]VideoTokenPrice `json:"videoTokenPrices,omitempty"`
	// 按量计费 for chat: points per 1,000 input / output tokens.
	TokenInputPrice  float64 `json:"tokenInputPrice,omitempty"`
	TokenOutputPrice float64 `json:"tokenOutputPrice,omitempty"`
	// Input tokens the provider read from its cache (unset: the input price).
	TokenCachedPrice *float64 `json:"tokenCachedPrice,omitempty"`
	// Peak-hour multiplier on all three prices (DeepSeek: 2); 0 or 1 = none.
	PeakPriceRate               float64                       `json:"peakPriceRate,omitempty"`
	MaxOutputTokens             int                           `json:"maxOutputTokens,omitempty"`
	PriceMatrix                 map[string]map[string]float64 `json:"priceMatrix,omitempty"`
	PricePerRequestByResolution map[string]float64            `json:"pricePerRequestByResolution,omitempty"`
	ErrorHints                  []ErrorHint                   `json:"errorHints,omitempty"`
	AvailabilityStatus          string                        `json:"availabilityStatus,omitempty"`
}

// Modes retain their protocol restrictions; parameter overrides are authoritative.
func selection[T comparable](upstream, configured []T) []T {
	if len(configured) == 0 {
		return upstream
	}
	out := []T{}
	for _, v := range upstream {
		if slices.Contains(configured, v) {
			out = append(out, v)
		}
	}
	return out
}

func parameterSelection[T comparable](upstream, configured []T) []T {
	if len(configured) > 0 {
		return slices.Clone(configured)
	}
	return upstream
}

func (m Model) Effective() Model {
	s := m.Settings
	m.Modes = NormalizeGenerationModes(m.Modes)
	s.Modes = NormalizeGenerationModes(s.Modes)
	m.Settings.Modes = s.Modes
	beforeModes := len(m.Modes)
	m.Modes = selection(m.Modes, s.Modes)
	official := m // 火山方舟 Seedance takes only its own values: narrowed, never widened
	m.Resolutions = parameterSelection(m.Resolutions, s.Resolutions)
	m.Ratios = parameterSelection(m.Ratios, s.Ratios)
	m.Qualities = parameterSelection(m.Qualities, s.Qualities)
	m.Durations = parameterSelection(m.Durations, s.Durations)
	if _, ark := ArkVideo(m.Key); ark {
		m.Resolutions = selection(official.Resolutions, s.Resolutions)
		m.Ratios = selection(official.Ratios, s.Ratios)
		m.Durations = selection(official.Durations, s.Durations)
	}
	m = m.fixedParameters()
	if beforeModes > 0 && len(m.Modes) == 0 {
		m.Available = false
	}
	refs := []string{}
	for _, typ := range m.ReferenceTypes {
		keep := true
		if m.Kind == "image" {
			keep = slices.Contains(m.Modes, "i2i")
		}
		if m.Kind == "video" {
			omni := slices.Contains(m.Modes, "omni_ref")
			if enabled, ok := s.OmniReferences[typ]; ok && !enabled {
				omni = false
			}
			keep = omni || (typ == "image" && (slices.Contains(m.Modes, "i2v") || slices.Contains(m.Modes, "keyframe")))
		}
		if keep {
			refs = append(refs, typ)
		}
	}
	m.ReferenceTypes = refs
	return m
}

func (s ModelSettings) ErrorMessage(cause, fallback string) string {
	for _, rule := range s.ErrorHints {
		if rule.Contains != "" && strings.Contains(strings.ToLower(cause), strings.ToLower(rule.Contains)) {
			return rule.Message
		}
	}
	return fallback
}
