package core

import "time"

type ToolCheck struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
	Path    string `json:"path,omitempty"`
	Error   string `json:"error,omitempty"`
}

type MediaTools struct {
	FFmpeg    ToolCheck `json:"ffmpeg"`
	FFprobe   ToolCheck `json:"ffprobe"`
	CheckedAt time.Time `json:"checkedAt"`
}
