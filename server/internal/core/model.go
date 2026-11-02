package core

import (
	"encoding/json"
	"slices"
	"strings"
)

// Model is the persisted, operator-controlled catalog entry. Key belongs to the relay.
type Model struct {
	ResolutionByMode map[string][]string                 `json:"resolutionByMode,omitempty"`
	ReferenceRules   map[string]map[string]ReferenceRule `json:"referenceRules,omitempty"`
	Icon             string                              `json:"icon,omitempty"`
	Settings         ModelSettings                       `json:"settings"`
	RecentJobs       int                                 `json:"recentJobs"`
	ReferenceTypes   []string                            `json:"referenceTypes"`
	ID               string                              `json:"id"`
	Key              string                              `json:"key"`
	Name             string                              `json:"name"`
	Kind             string                              `json:"kind"`
	Published        bool                                `json:"published"`
	Available        bool                                `json:"available"`
	Deleted          bool                                `json:"deleted,omitempty"`
	Sort             int                                 `json:"sort"`
	Points           float64                             `json:"points"`
	CreditCost       float64                             `json:"creditCost"`
	Resolutions      []string                            `json:"resolutions"`
	Ratios           []string                            `json:"ratios"`
	Durations        []int                               `json:"durations"`
	Qualities        []string                            `json:"qualities"`
	Modes            []string                            `json:"modes"`
	Operations       []string                            `json:"operations"`
	ParamsSchema     json.RawMessage                     `json:"paramsSchema"`
	PriceModifiers   json.RawMessage                     `json:"priceModifiers"`
	SyncedAt         string                              `json:"syncedAt"`
}

func (m Model) Supported() bool {
	return slices.Contains([]string{"image", "video", "chat"}, m.Kind) || (m.Kind == "audio" && strings.HasPrefix(m.Key, "tts-"))
}
func (m Model) Usable() bool {
	return m.Published && m.Available && !m.Deleted && m.Supported() && m.Settings.AvailabilityStatus != "maintenance"
}

type Reference struct {
	URL  string
	Type string
}

type GenerationOptions struct {
	Model      string `json:"model"`
	Resolution string `json:"resolution"`
	Ratio      string `json:"ratio"`
	Duration   int    `json:"duration"`
	Quality    string `json:"quality"`
	Mode       string `json:"mode"`
}
