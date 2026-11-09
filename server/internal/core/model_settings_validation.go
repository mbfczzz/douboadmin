package core

import (
	"fmt"
	"math"
	"net/url"
	"slices"
	"strconv"
	"strings"
)

func validSelection[T comparable](chosen, allowed []T) bool {
	for _, v := range chosen {
		if !slices.Contains(allowed, v) {
			return false
		}
	}
	return true
}
func validRate(n float64) bool { return !math.IsNaN(n) && !math.IsInf(n, 0) && n >= 0 && n <= 1e9 }

func (s ModelSettings) Validate(m Model) error {
	if len([]rune(s.Description)) > 500 || s.EstSeconds < 0 || s.EstSeconds > 86400 || len(s.Badges) > 4 {
		return fmt.Errorf("描述、预计耗时或标签数量无效")
	}
	if len(s.Icon) > 2000 {
		return fmt.Errorf("图标地址过长")
	}
	if s.Icon != "" && !strings.HasPrefix(s.Icon, "/media/model-icons/") {
		u, e := url.Parse(s.Icon)
		if e != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
			if len([]rune(s.Icon)) > 8 || strings.ContainsAny(s.Icon, "<>:/\\") {
				return fmt.Errorf("图标请使用品牌图标、简短字符或 HTTPS 图片地址")
			}
		}
	}
	if strings.Contains(s.Icon, "..") {
		return fmt.Errorf("图标地址无效")
	}
	if s.CostUSD != "" {
		v, e := strconv.ParseFloat(s.CostUSD, 64)
		if e != nil || !validRate(v) {
			return fmt.Errorf("成本价无效")
		}
	}
	for i, b := range s.Badges {
		if strings.TrimSpace(b.Text) == "" || len([]rune(b.Text)) > 16 {
			return fmt.Errorf("第 %d 个模型标签需填写 1–16 个字，或删除该标签", i+1)
		}
		if !slices.Contains([]string{"hot", "new", "info"}, b.Tone) {
			return fmt.Errorf("第 %d 个模型标签样式无效", i+1)
		}
	}
	if !validSelection(s.Modes, m.Modes) || !validSelection(s.Resolutions, m.Resolutions) || !validSelection(s.Ratios, m.Ratios) || !validSelection(s.Qualities, m.Qualities) || !validSelection(s.Durations, m.Durations) {
		return fmt.Errorf("选择的能力不在上游支持范围内，请重新同步模型")
	}
	if s.MaxRefImages < 0 || s.MaxRefImages > 20 || s.MaxRefImageSizeMB < 0 || s.MaxRefImageSizeMB > 50 || !validRate(s.MaxRefImageSizeMB) {
		return fmt.Errorf("参考图数量或大小限制无效")
	}
	for key, n := range s.RefLimits {
		allowed := false
		for _, mode := range []string{"i2v", "keyframe", "omniRef"} {
			for _, typ := range []string{"image", "video", "audio"} {
				if key == mode+"."+typ+"Count" || key == mode+"."+typ+"SizeMB" {
					allowed = true
				}
			}
		}
		if !allowed || !validRate(n) || n > 50 || (strings.HasSuffix(key, "Count") && (n > 20 || math.Trunc(n) != n)) {
			return fmt.Errorf("素材限制字段无效")
		}
	}
	for typ, enabled := range s.OmniReferences {
		if !slices.Contains([]string{"image", "video", "audio"}, typ) || (enabled && !slices.Contains(m.ReferenceTypes, typ)) {
			return fmt.Errorf("上游不支持该参考素材类型")
		}
	}
	if s.MaxPromptChars < 0 || s.MaxPromptChars > 500 || len([]rune(s.DefaultPrompt)) > 500 || len(s.Ideas) > 10 {
		return fmt.Errorf("提示词设置无效，当前小程序最多支持 500 字")
	}
	if s.MaxPromptChars > 0 && len([]rune(s.DefaultPrompt)) > s.MaxPromptChars {
		return fmt.Errorf("默认提示词超过所设字数限制")
	}
	for _, idea := range s.Ideas {
		if len([]rune(idea)) > 500 {
			return fmt.Errorf("灵感提示词超过 500 字")
		}
	}
	if !slices.Contains([]string{"", "duration", "per_request"}, s.VideoBillingMode) {
		return fmt.Errorf("视频计费方式无效")
	}
	if len(s.PriceMatrix) > 600 || len(s.PricePerRequestByResolution) > 40 {
		return fmt.Errorf("积分配置过多")
	}
	for k, row := range s.PriceMatrix {
		if len(k) > 32 || len(row) > 40 {
			return fmt.Errorf("积分矩阵格式无效")
		}
		for col, n := range row {
			if len(col) > 32 || !validRate(n) {
				return fmt.Errorf("积分单价无效")
			}
		}
	}
	for col, n := range s.PricePerRequestByResolution {
		if len(col) > 32 || !validRate(n) {
			return fmt.Errorf("按次积分无效")
		}
	}
	if len(s.ErrorHints) > 20 {
		return fmt.Errorf("最多设置 20 条错误提示映射")
	}
	for _, h := range s.ErrorHints {
		if strings.TrimSpace(h.Contains) == "" || strings.TrimSpace(h.Message) == "" || len([]rune(h.Contains)) > 200 || len([]rune(h.Message)) > 300 {
			return fmt.Errorf("请填写完整的错误匹配片段和提示文案")
		}
	}
	if !slices.Contains([]string{"", "normal", "maintenance"}, s.AvailabilityStatus) {
		return fmt.Errorf("运行状态无效")
	}
	return nil
}
