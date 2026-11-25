package core

import (
	"fmt"
	"math"
	"slices"
	"strconv"
)

const tierSlack = 0.1

// ReferenceVideoError is a 参考视频计费 problem the user can act on.
type ReferenceVideoError string

func (e ReferenceVideoError) Error() string { return string(e) }

// ReferenceVideoUnits prices the reference videos of a video job the way
// FlowLight's 参考视频计费 does: each video is rounded up to the shortest
// configured output duration that covers it and costs that duration's
// 时长 × 清晰度 price after the configured percentage, on top of the
// generation itself. seconds holds the measured length of every reference
// video (one entry per use).
func ReferenceVideoUnits(m Model, in JobInput, seconds []float64) (int64, error) {
	if in.Kind != "video" || !m.Settings.ReferenceVideoBilling || len(seconds) == 0 {
		return 0, nil
	}
	durations := slices.Clone(m.Durations)
	slices.Sort(durations)
	var total int64
	for _, length := range seconds {
		length = math.Ceil(length*1000) / 1000
		tier := 0
		for _, d := range durations {
			// A cut clip or container often runs a frame or two (< 0.1 s)
			// past the second it was meant to end on.
			if float64(d)+tierSlack >= length {
				tier = d
				break
			}
		}
		if tier == 0 {
			return 0, ReferenceVideoError(fmt.Sprintf("参考视频超过 %d 秒，请换一段更短的视频", slices.Max(append(durations, 0))))
		}
		price, ok := m.Settings.PriceMatrix[strconv.Itoa(tier)+"s"][in.Resolution]
		if !ok || price <= 0 {
			return 0, ReferenceVideoError("参考视频计费价格未配置，请联系客服")
		}
		percent := 100.0
		if m.Settings.ReferenceVideoPricePercent != nil {
			percent = *m.Settings.ReferenceVideoPricePercent
		}
		units, err := PointUnits(price * percent / 100)
		if err != nil {
			return 0, err
		}
		total += units
	}
	if total > MaxBalance {
		return 0, ReferenceVideoError("本次积分超出允许范围")
	}
	return total, nil
}

// validateReferenceVideoBilling: the billing needs a price for every
// duration × resolution it may charge, and the model must take video.
func (s ModelSettings) validateReferenceVideoBilling(m Model) error {
	if p := s.ReferenceVideoPricePercent; p != nil && (!validRate(*p) || *p < 1 || *p > 100) {
		return fmt.Errorf("参考视频价格比例应为 1%%–100%%")
	}
	if !s.ReferenceVideoBilling {
		return nil
	}
	if m.Kind != "video" {
		return fmt.Errorf("参考视频计费只适用于视频模型")
	}
	if _, ark := ArkVideo(m.Key); ark {
		return fmt.Errorf("火山方舟模型已按实际用量（含参考视频）计费，无需开启参考视频计费")
	}
	e := m
	e.Settings = s
	e = e.Effective()
	if !slices.Contains(e.ReferenceTypes, "video") {
		return fmt.Errorf("开启参考视频计费前，请先在全能参考中支持参考视频")
	}
	if s.HideResolution {
		return fmt.Errorf("隐藏清晰度选择的模型无法开启参考视频计费")
	}
	if len(e.Durations) == 0 || len(e.Resolutions) == 0 {
		return fmt.Errorf("开启参考视频计费后，请先选择支持时长和清晰度")
	}
	for _, d := range e.Durations {
		for _, r := range e.Resolutions {
			if s.PriceMatrix[strconv.Itoa(d)+"s"][r] <= 0 {
				return fmt.Errorf("请填写 %ds / %s 的参考视频计费积分", d, r)
			}
		}
	}
	return nil
}
