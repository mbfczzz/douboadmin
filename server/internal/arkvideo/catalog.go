// Package arkvideo calls 火山方舟's video generation API for the fixed
// Seedance models (key "arkvideo:<id>"). Parameters, limits and prices follow
// the official docs (2026-11): 「Seedance 2.0 / 2.5」, 「创建 / 查询视频生成任务」
// and 「模型服务价格 · 视频生成」 (元/百万 token, ×10 for points).
package arkvideo

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strconv"
)

// Spec is one fixed model as 火山方舟 documents it.
type Spec struct {
	ID, Name    string
	Resolutions []string
	MaxSeconds  int    // output 4–MaxSeconds s; each reference video ≤ it, all ≤ it
	Refs        [3]int // reference images, videos, audios
	Prices      map[string]core.VideoTokenPrice
	AudioAlone  bool // audio may be the only reference (2.5); 2.0 needs an image or video too
}

// Find is the spec of an Ark model id.
func Find(id string) (Spec, bool) {
	for _, s := range Models {
		if s.ID == id {
			return s, true
		}
	}
	return Spec{}, false
}

// CheckReferences applies the limits 方舟 checks after a task is paid for:
// audio-only references (2.0) and the total length of reference videos.
func CheckReferences(id string, counts map[string]int, videoSeconds []float64) error {
	s, ok := Find(id)
	if !ok {
		return nil
	}
	if counts["audio"] > 0 && counts["image"] == 0 && counts["video"] == 0 && !s.AudioAlone {
		return core.ReferenceVideoError(s.Name + " 参考音频时需同时上传图片或视频")
	}
	total := 0.0
	for _, n := range videoSeconds {
		total += n
	}
	if total > float64(s.MaxSeconds)+0.1 {
		return core.ReferenceVideoError(fmt.Sprintf("%s 的参考视频总时长不能超过 %d 秒", s.Name, s.MaxSeconds))
	}
	return nil
}

func price(plain, withVideo float64) core.VideoTokenPrice {
	return core.VideoTokenPrice{Plain: plain * 10, WithVideo: withVideo * 10}
}

var Models = []Spec{
	{ID: "doubao-seedance-2-5-260628", Name: "Seedance 2.5", Resolutions: []string{"480p", "720p", "1080p", "4k"}, MaxSeconds: 30, Refs: [3]int{30, 10, 10}, AudioAlone: true,
		Prices: map[string]core.VideoTokenPrice{"480p": price(70, 42), "720p": price(70, 42), "1080p": price(77, 46), "4k": price(31, 19)}},
	{ID: "doubao-seedance-2-5-flash-261115", Name: "Seedance 2.5 Flash", Resolutions: []string{"480p", "720p"}, MaxSeconds: 30, Refs: [3]int{10, 5, 5}, AudioAlone: true,
		Prices: map[string]core.VideoTokenPrice{"480p": price(46, 28), "720p": price(46, 28)}},
	{ID: "doubao-seedance-2-0-260128", Name: "Seedance 2.0", Resolutions: []string{"480p", "720p", "1080p", "4k"}, MaxSeconds: 15, Refs: [3]int{9, 3, 3},
		Prices: map[string]core.VideoTokenPrice{"480p": price(46, 28), "720p": price(46, 28), "1080p": price(51, 31), "4k": price(26, 16)}},
	{ID: "doubao-seedance-2-0-fast-260128", Name: "Seedance 2.0 Fast", Resolutions: []string{"480p", "720p"}, MaxSeconds: 15, Refs: [3]int{9, 3, 3},
		Prices: map[string]core.VideoTokenPrice{"480p": price(37, 22), "720p": price(37, 22)}},
	{ID: "doubao-seedance-2-0-mini-260615", Name: "Seedance 2.0 Mini", Resolutions: []string{"480p", "720p"}, MaxSeconds: 15, Refs: [3]int{9, 3, 3},
		Prices: map[string]core.VideoTokenPrice{"480p": price(23, 14), "720p": price(23, 14)}},
}

// Ratios Seedance renders ("adaptive" — follow the first frame — is used
// for first-frame tasks only, see request.go).
var Ratios = []string{"16:9", "9:16", "4:3", "3:4", "1:1", "21:9"}

// Modes: 文生视频, 首帧, 首尾帧 and 全能参考 (images, videos and audio).
var Modes = []string{"t2v", "i2v", "keyframe", "omni_ref"}

// Size limits per reference file, MB (图片 30, 视频 200, 音频 15).
const imageMB, videoMB, audioMB = 30, 200, 15

// ModelID is the 模型管理 row of a fixed model.
func ModelID(id string) string { return "arkvideo-" + id }

// Capabilities are the fixed, official fields; Apply sets them on a row.
func (s Spec) Apply(m *core.Model) {
	durations, labels := []int{}, []string{}
	for d := 4; d <= s.MaxSeconds; d++ {
		durations, labels = append(durations, d), append(labels, strconv.Itoa(d))
	}
	m.Key, m.Kind = core.ArkVideoPrefix+s.ID, "video"
	m.Resolutions, m.Ratios, m.Durations, m.Qualities = append([]string{}, s.Resolutions...), append([]string{}, Ratios...), durations, []string{}
	m.Modes, m.Operations = append([]string{}, Modes...), []string{"generation"}
	m.ReferenceTypes = []string{"image", "video", "audio"}
	m.ParamsSchema, _ = json.Marshal(map[string]any{"modes": Modes, "aspect": Ratios, "resolution": s.Resolutions, "duration": labels,
		"ref_limits": map[string]int{"image": s.Refs[0], "video": s.Refs[1], "audio": s.Refs[2]}})
	m.PriceModifiers, m.Points, m.CreditCost = json.RawMessage("{}"), 0, 0
}

// Defaults are the operator-editable settings a new row starts with.
func (s Spec) Defaults() core.ModelSettings {
	// A job takes at most 20 materials, so Seedance 2.5's 30 images count as 20.
	limits := map[string]float64{
		"omniRef.imageCount": float64(min(s.Refs[0], 20)), "omniRef.videoCount": float64(s.Refs[1]), "omniRef.audioCount": float64(s.Refs[2]),
		"omniRef.imageSizeMB": imageMB, "omniRef.videoSizeMB": videoMB, "omniRef.audioSizeMB": audioMB,
		"omniRef.videoSeconds": float64(s.MaxSeconds),
		"i2v.imageSizeMB":      imageMB, "keyframe.imageSizeMB": imageMB,
	}
	prices := map[string]core.VideoTokenPrice{}
	for k, v := range s.Prices {
		prices[k] = v
	}
	return core.ModelSettings{Description: "火山方舟官方直连，按实际视频 token 计费", RefLimits: limits, VideoTokenPrices: prices}
}
