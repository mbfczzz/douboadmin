package core

// Public upload constraints contain no provider credentials or pricing rules.
type ReferenceRule struct {
	MinCount  int     `json:"minCount,omitempty"`
	MaxCount  int     `json:"maxCount"`
	MaxSizeMB float64 `json:"maxSizeMB"`
}
