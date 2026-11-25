package billing

import (
	"doubo/server/internal/core"
	"fmt"
	"math"
	"strings"
)

// 火山方舟 Seedance bills the video tokens it reports after a task succeeds
// (usage.completion_tokens). Its documented estimate is
// (input video seconds + output seconds) × width × height × fps / 1024, at
// 24 fps. The hold uses that estimate with slack: the official example
// reports 108,900 tokens where the formula gives 108,000, and inputs with a
// video have a minimum token count. Completion charges the reported usage,
// never more than the hold.
const (
	arkVideoFPS   = 24
	arkVideoSlack = 1.15
)

// ArkVideoTokens estimates a task's tokens (without slack).
func ArkVideoTokens(in core.JobInput, videoSeconds []float64) float64 {
	seconds := float64(in.Duration)
	for _, s := range videoSeconds {
		seconds += s
	}
	ratio := in.Ratio
	if mode := core.NormalizeGenerationMode(in.Mode); mode == "i2v" || mode == "keyframe" {
		ratio = "" // first-frame tasks follow the picture's shape
	}
	return seconds * float64(core.ArkVideoPixels(in.Resolution, ratio)) * arkVideoFPS / 1024
}

// ArkVideoHold is the most a task can cost. videoSeconds lists its reference
// videos (none: the price without an input video).
func ArkVideoHold(m core.Model, in core.JobInput, videoSeconds []float64) (int64, error) {
	return ArkVideoUnits(m, in, int64(math.Ceil(ArkVideoTokens(in, videoSeconds)*arkVideoSlack)), len(videoSeconds) > 0)
}

// ArkVideoUnits prices tokens at the model's rate for the output
// resolution, rounded up to 0.01 points.
func ArkVideoUnits(m core.Model, in core.JobInput, tokens int64, withVideo bool) (int64, error) {
	price, ok := m.Settings.VideoTokenPrices[strings.ToLower(in.Resolution)]
	rate := price.Plain
	if withVideo {
		rate = price.WithVideo
	}
	if !ok || rate <= 0 {
		return 0, fmt.Errorf("该清晰度尚未配置积分价格")
	}
	points := float64(max(tokens, 0)) * rate / 1e6
	return core.PointUnits(math.Ceil(points*float64(core.PointScale)-1e-9) / float64(core.PointScale))
}
