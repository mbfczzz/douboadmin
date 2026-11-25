package core

import (
	"fmt"
	"strings"
)

// ArkVideoPrefix marks the fixed Seedance models generated directly at 火山方舟
// (key "arkvideo:<model id>"), the one exception to "media generation goes
// through the relay". Users still reach them only through /api/jobs; the
// relay catalog sync never lists, changes or hides them.
const ArkVideoPrefix = "arkvideo:"

// ArkVideo reports a fixed 火山方舟 video model and its Ark model id.
func ArkVideo(key string) (string, bool) {
	id, ok := strings.CutPrefix(key, ArkVideoPrefix)
	return id, ok && id != ""
}

// VideoTokenPrice is 火山方舟's price for one output resolution, in points
// per million video tokens (元/百万 token × 10): without and with an input
// (reference) video.
type VideoTokenPrice struct {
	Plain     float64 `json:"plain"`
	WithVideo float64 `json:"withVideo"`
}

// ArkVideoPixels is the output frame size (width × height) Seedance renders
// for a resolution and ratio (官方「输出视频分辨率」表; the larger of the 2.0 and
// 2.5 sizes where they differ). An unknown ratio — first-frame tasks follow the
// picture ("adaptive") — counts as the largest frame of that resolution.
func ArkVideoPixels(resolution, ratio string) int {
	sizes := arkVideoSizes[strings.ToLower(resolution)]
	if px, ok := sizes[ratio]; ok {
		return px
	}
	largest := 0
	for _, px := range sizes {
		largest = max(largest, px)
	}
	return largest
}

var arkVideoSizes = map[string]map[string]int{
	"480p":  {"16:9": 864 * 496, "9:16": 496 * 864, "4:3": 752 * 560, "3:4": 560 * 752, "1:1": 640 * 640, "21:9": 992 * 432},
	"720p":  {"16:9": 1280 * 720, "9:16": 720 * 1280, "4:3": 1112 * 834, "3:4": 834 * 1112, "1:1": 960 * 960, "21:9": 1470 * 630},
	"1080p": {"16:9": 1920 * 1080, "9:16": 1080 * 1920, "4:3": 1664 * 1248, "3:4": 1248 * 1664, "1:1": 1440 * 1440, "21:9": 2206 * 946},
	"4k":    {"16:9": 3840 * 2160, "9:16": 2160 * 3840, "4:3": 3326 * 2494, "3:4": 2494 * 3326, "1:1": 2880 * 2880, "21:9": 4398 * 1886},
}

// validateVideoTokenPrices: only the fixed 火山方舟 models are priced per
// video token, and each price is 0–100000 points per million tokens.
func (s ModelSettings) validateVideoTokenPrices(m Model) error {
	_, ark := ArkVideo(m.Key)
	if len(s.VideoTokenPrices) > 0 && !ark {
		return fmt.Errorf("只有火山方舟直连的视频模型按视频 token 计费")
	}
	if ark { // every resolution it offers needs both prices
		e := m
		e.Settings = s
		for _, res := range e.Effective().Resolutions {
			if p := s.VideoTokenPrices[strings.ToLower(res)]; p.Plain <= 0 || p.WithVideo <= 0 {
				return fmt.Errorf("请填写 %s 的视频 token 单价", strings.ToUpper(res))
			}
		}
	}
	for res, p := range s.VideoTokenPrices {
		if len(res) > 16 || !validRate(p.Plain) || !validRate(p.WithVideo) || p.Plain > 100000 || p.WithVideo > 100000 {
			return fmt.Errorf("视频 token 单价无效")
		}
	}
	return nil
}
