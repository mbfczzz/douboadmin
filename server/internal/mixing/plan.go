package mixing

import (
	"fmt"
	"math"
)

type Source struct {
	ID     string    `json:"id"`
	Image  bool      `json:"image"`
	Info   Probe     `json:"info"`
	Scenes []float64 `json:"scenes"`
}
type Cut struct {
	AssetID  string  `json:"assetId"`
	Start    float64 `json:"start"`
	Duration float64 `json:"duration"`
}

func Plan(sources []Source, duration float64, style string) ([]Cut, error) {
	if len(sources) == 0 || duration <= 0 || duration > 120 {
		return nil, fmt.Errorf("素材或目标时长无效")
	}
	length := 4.0
	if style == "rhythm" {
		length = 2
	}
	if style == "cinematic" {
		length = 5
	}
	candidates := []Cut{}
	for _, s := range sources {
		if s.Image {
			candidates = append(candidates, Cut{AssetID: s.ID, Duration: length})
			continue
		}
		if s.Info.Duration <= 0 {
			return nil, fmt.Errorf("视频时长不可用")
		}
		starts := s.Scenes
		if len(starts) == 0 {
			starts = []float64{0}
		}
		for i, start := range starts {
			end := s.Info.Duration
			if i+1 < len(starts) {
				end = starts[i+1]
			}
			n := math.Min(length, end-start)
			if n >= .4 {
				candidates = append(candidates, Cut{AssetID: s.ID, Start: start, Duration: n})
			}
		}
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("没有可用镜头")
	}
	out := []Cut{}
	remaining := duration
	for i := 0; remaining > .01 && i < 300; i++ {
		c := candidates[i%len(candidates)]
		c.Duration = math.Min(c.Duration, remaining)
		out = append(out, c)
		remaining -= c.Duration
	}
	return out, nil
}
func dimensions(ratio, resolution string) (int, int) {
	short := 720
	if resolution == "1080p" {
		short = 1080
	}
	switch ratio {
	case "16:9":
		return short * 16 / 9, short
	case "1:1":
		return short, short
	default:
		return short, short * 16 / 9
	}
}
