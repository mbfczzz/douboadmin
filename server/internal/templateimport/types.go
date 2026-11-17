// Package templateimport converts versioned FlowLight exports without calling a generator.
package templateimport

import "doubo/server/internal/core"

type Pack struct {
	Format        string    `json:"format"`
	SchemaVersion int       `json:"schemaVersion"`
	SourceOrigin  string    `json:"sourceOrigin"`
	Total         int       `json:"total"`
	Templates     []Recipe  `json:"templates"`
	ModelBindings []Binding `json:"modelBindings"`
}

type Recipe struct {
	ID, Kind, MediaType, Title, Description, Category, Prompt string
	CoverURL, PreviewURL, ModelKey, InputHint                 string
	SelectableModelKeys                                       []string
	Status, SortOrder                                         int
	Mode                                                      string
	InputLabels                                               struct{ Images []string }
	Requirements                                              struct {
		Images, Videos, Audio int
		OptionalImages        []int
	}
	Options struct {
		AspectRatio, Resolution, Quality string
		Duration                         float64
		BatchCount                       int
	}
}

type Binding struct {
	Reference string
	Models    []struct{ ID, ModelKey string }
}

type Item struct {
	SourceID string        `json:"sourceId"`
	ID       string        `json:"id"`
	Title    string        `json:"title"`
	Action   string        `json:"action"`
	Reason   string        `json:"reason,omitempty"`
	Model    string        `json:"model,omitempty"`
	Images   int           `json:"images"`
	Required int           `json:"required"`
	Chars    int           `json:"chars"`
	Data     core.Template `json:"-"`
}
