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
	Description                 string                        `json:"description,omitempty"`
	Icon                        string                        `json:"icon,omitempty"`
	CostUSD                     string                        `json:"costUsd,omitempty"`
	EstSeconds                  int                           `json:"estSeconds,omitempty"`
	Badges                      []ModelBadge                  `json:"badges,omitempty"`
	Modes                       []string                      `json:"modes,omitempty"`
	Resolutions                 []string                      `json:"resolutions,omitempty"`
	Ratios                      []string                      `json:"ratios,omitempty"`
	Qualities                   []string                      `json:"qualities,omitempty"`
	Durations                   []int                         `json:"durations,omitempty"`
	MaxRefImages                int                           `json:"maxRefImages,omitempty"`
	MaxRefImageSizeMB           float64                       `json:"maxRefImageSizeMB,omitempty"`
	RefLimits                   map[string]float64            `json:"refLimits,omitempty"`
	OmniReferences              map[string]bool               `json:"omniReferences,omitempty"`
	DefaultPrompt               string                        `json:"defaultPrompt,omitempty"`
	Ideas                       []string                      `json:"ideas,omitempty"`
	MaxPromptChars              int                           `json:"maxPromptChars,omitempty"`
	VideoBillingMode            string                        `json:"videoBillingMode,omitempty"`
	PriceMatrix                 map[string]map[string]float64 `json:"priceMatrix,omitempty"`
	PricePerRequestByResolution map[string]float64            `json:"pricePerRequestByResolution,omitempty"`
	ErrorHints                  []ErrorHint                   `json:"errorHints,omitempty"`
	AvailabilityStatus          string                        `json:"availabilityStatus,omitempty"`
}

// The upstream catalog remains authoritative. Operator choices only restrict it.
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

func (m Model) Effective() Model {
	s := m.Settings
	before := []int{len(m.Modes), len(m.Resolutions), len(m.Ratios), len(m.Qualities), len(m.Durations)}
	m.Modes = selection(m.Modes, s.Modes)
	m.Resolutions = selection(m.Resolutions, s.Resolutions)
	m.Ratios = selection(m.Ratios, s.Ratios)
	m.Qualities = selection(m.Qualities, s.Qualities)
	m.Durations = selection(m.Durations, s.Durations)
	for i, n := range []int{len(m.Modes), len(m.Resolutions), len(m.Ratios), len(m.Qualities), len(m.Durations)} {
		if before[i] > 0 && n == 0 {
			m.Available = false
		}
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
