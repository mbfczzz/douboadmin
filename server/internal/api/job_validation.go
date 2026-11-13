package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

func (a *Server) validateJob(ctx context.Context, user string, in *core.JobInput) error {
	if !core.IsGeneration(in.Kind) {
		return fmt.Errorf("该任务类型暂未开放")
	}
	if !a.Relay.Ready() {
		return fmt.Errorf("生成服务尚未配置")
	}
	if a.Config.Production && core.IsWork(in.Kind) && a.Objects == nil {
		return fmt.Errorf("请先在后台系统设置中配置 OSS 存储")
	}
	m, err := a.model(ctx, in.Model)
	if err != nil || !m.Usable() || m.Kind != in.Kind {
		return fmt.Errorf("请选择已上架的有效模型")
	}
	if strings.TrimSpace(in.Prompt) == "" {
		return fmt.Errorf("请输入创作描述")
	}
	if limit := m.Settings.PromptLimit(m.Kind); len([]rune(in.Prompt)) > limit {
		return fmt.Errorf("此模型的提示词最多 %d 字", limit)
	}
	if in.Kind != "chat" {
		if (len(m.Resolutions) > 0 && !slices.Contains(m.Resolutions, in.Resolution)) || (len(m.Ratios) > 0 && !slices.Contains(m.Ratios, in.Ratio)) {
			return fmt.Errorf("该模型不支持所选分辨率或画幅")
		}
		if len(m.Qualities) > 0 && !slices.Contains(m.Qualities, in.Quality) {
			return fmt.Errorf("请选择该模型支持的质量档位")
		}
	}
	if in.Kind == "video" && !slices.Contains(m.Durations, in.Duration) {
		return fmt.Errorf("该模型不支持所选时长")
	}
	if in.Kind == "audio" {
		var schema struct {
			Voice []string `json:"voice"`
		}
		_ = json.Unmarshal(m.ParamsSchema, &schema)
		if len(schema.Voice) > 0 && !slices.Contains(schema.Voice, in.Voice) {
			return fmt.Errorf("配音音色无效")
		}
	}
	if len(in.Assets) > 20 {
		return fmt.Errorf("最多上传 20 个素材")
	}
	if len(in.Assets) > 0 && a.Objects == nil {
		return fmt.Errorf("参考素材生成需要先配置 OSS 存储")
	}
	counts := map[string]int{}
	sizes := map[string][]int64{}
	for _, id := range in.Assets {
		r, e := a.Store.Get(ctx, "assets", id)
		if e != nil || r.Owner != user {
			return fmt.Errorf("素材不存在或不属于当前用户")
		}
		var asset struct {
			Type string `json:"type"`
			Size int64  `json:"size"`
		}
		_ = json.Unmarshal(r.Data, &asset)
		typ := strings.Split(asset.Type, "/")[0]
		counts[typ]++
		sizes[typ] = append(sizes[typ], asset.Size)
		if !slices.Contains(m.ReferenceTypes, typ) {
			return fmt.Errorf("此模型不支持该类型参考素材")
		}
	}
	mode := in.Mode
	if mode == "" {
		mode = core.GenerationMode(in.Kind, m.Modes, counts, len(in.Assets))
	}
	if in.Kind != "chat" && len(m.Modes) > 0 && !slices.Contains(m.Modes, mode) {
		return fmt.Errorf("此模型不支持当前参考素材的生成方式")
	}
	if (mode == "i2v" && (counts["image"] != 1 || len(in.Assets) != 1)) || (mode == "keyframe" && (counts["image"] != 2 || len(in.Assets) != 2)) || (slices.Contains([]string{"i2i", "omni_ref"}, mode) && len(in.Assets) == 0) {
		return fmt.Errorf("参考图片数量与生成方式不匹配")
	}
	if slices.Contains([]string{"t2i", "t2v"}, mode) && len(in.Assets) > 0 {
		return fmt.Errorf("纯文本生成不接受参考素材，请切换生成方式")
	}
	var schema relay.Schema
	if err := validateModelReferences(m, mode, counts, sizes); err != nil {
		return err
	}
	_ = json.Unmarshal(m.ParamsSchema, &schema)
	if mode == "i2i" && counts["image"] < schema.EditImages.Min {
		return fmt.Errorf("参考图片少于模型要求的最小数量")
	}
	if in.Kind == "image" && schema.EditImages.Max > 0 && len(in.Assets) > schema.EditImages.Max {
		return fmt.Errorf("参考图片超过模型数量限制")
	}
	if supported := schema.ResolutionByMode[mode]; len(supported) > 0 && !slices.Contains(supported, in.Resolution) {
		return fmt.Errorf("此生成方式不支持所选分辨率")
	}
	for typ, count := range counts {
		if raw, ok := schema.RefLimits[typ]; ok && mode == "omni_ref" {
			var max int
			if json.Unmarshal(raw, &max) == nil && count > max {
				return fmt.Errorf("参考素材超过模型数量限制")
			}
		}
	}
	if in.TemplateID != "" {
		r, e := a.Store.Get(ctx, "templates", in.TemplateID)
		if e != nil {
			return fmt.Errorf("模板不存在")
		}
		var t core.Template
		_ = json.Unmarshal(r.Data, &t)
		if t.Kind != "video" || !t.Published || t.Deleted || t.Kind != in.Kind || t.Model != in.Model {
			return fmt.Errorf("模板或关联模型已变化，请重新打开模板")
		}
		if counts["image"] < t.RequiredImages {
			return fmt.Errorf("请上传模板要求的图片")
		}
	}
	in.Mode = mode
	return nil
}
