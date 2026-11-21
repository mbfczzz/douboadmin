package core

import "strings"

// Public upload constraints contain no provider credentials or pricing rules.
type ReferenceRule struct {
	MinCount  int     `json:"minCount,omitempty"`
	MaxCount  int     `json:"maxCount"`
	MaxSizeMB float64 `json:"maxSizeMB"`
	// MaxSeconds: the longest reference video the model takes (全能参考 video
	// only); 一键复刻 cuts the original to it.
	MaxSeconds int `json:"maxSeconds,omitempty"`
}

// RefVideoSeconds is how long a reference video may be for this model: the
// operator's setting (模型配置 → 全能参考 · 参考视频时长), else the official
// limit of the family (火山方舟: Seedance 2.5 takes up to 30 s, 2.0 up to 15 s),
// else 15 s, which every video model in use accepts.
func RefVideoSeconds(m Model) int {
	if n := m.Settings.RefLimits["omniRef.videoSeconds"]; n > 0 {
		return int(n)
	}
	name := strings.ToLower(m.Name + " " + m.Key)
	if strings.Contains(name, "2.5") && (strings.Contains(name, "seedance") || strings.Contains(name, "sd")) {
		return 30
	}
	return 15
}
