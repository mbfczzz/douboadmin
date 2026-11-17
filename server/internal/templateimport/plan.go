package templateimport

import (
	"doubo/server/internal/core"
	"fmt"
	"net/url"
	"slices"
	"strings"
	"unicode/utf8"
)

func Plan(pack Pack, models []core.Model, publish bool) ([]Item, error) {
	origin, err := url.Parse(pack.SourceOrigin)
	if err != nil || origin.Scheme != "https" || origin.Hostname() == "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" {
		return nil, fmt.Errorf("导出文件的来源站点无效")
	}
	if pack.Format != "flowlight.studio-templates" || pack.SchemaVersion != 1 || pack.Total != len(pack.Templates) || pack.Total > 2000 {
		return nil, fmt.Errorf("仅支持完整的 FlowLight v1 模板导出文件，单次最多 2000 条")
	}
	byKey := map[string][]core.Model{}
	for _, m := range models {
		byKey[m.Key] = append(byKey[m.Key], m.Effective())
	}
	references := map[string]string{}
	for _, binding := range pack.ModelBindings {
		keys := map[string]bool{}
		for _, m := range binding.Models {
			keys[m.ModelKey] = true
		}
		if len(keys) == 1 {
			for key := range keys {
				references[binding.Reference] = key
			}
		}
	}
	resolve := func(reference string) (core.Model, error) {
		key := references[reference]
		if key == "" {
			key = reference
		}
		candidates := byKey[key]
		if len(candidates) != 1 || candidates[0].Deleted {
			return core.Model{}, fmt.Errorf("模型 %s 未找到唯一对应记录，请先同步或配置模型", reference)
		}
		return candidates[0], nil
	}
	items, seen := []Item{}, map[string]bool{}
	for _, source := range pack.Templates {
		if source.ID == "" || seen[source.ID] {
			return nil, fmt.Errorf("导出文件的模板编号缺失或重复")
		}
		seen[source.ID] = true
		item := Item{SourceID: source.ID, Title: source.Title, Action: "create", Chars: utf8.RuneCountInString(source.Prompt)}
		item.ID = "flowlight-" + core.Digest(strings.TrimRight(origin.String(), "/") + ":" + source.ID)[:32]
		if source.MediaType != "video" {
			item.Action, item.Reason = "skip", "当前创作模板仅支持视频，图片条目已保留在原导出文件"
		} else if data, e := convert(source, origin, resolve, publish); e != nil {
			item.Action, item.Reason = "blocked", e.Error()
		} else {
			item.Data, item.Model = data, data.Model
			item.Images, item.Required = len(data.ImageSlots), data.RequiredImages
			if data.Model == "" {
				item.Reason = "来源为未配置默认模型的草稿，导入后需选择模型才能上架"
			}
		}
		items = append(items, item)
	}
	return items, nil
}

func convert(source Recipe, origin *url.URL, resolve func(string) (core.Model, error), publish bool) (core.Template, error) {
	t := core.Template{Family: source.Kind, Kind: "video", Title: source.Title, Description: source.Description,
		Category: source.Category, Prompt: source.Prompt, InputHint: source.InputHint, Sort: source.SortOrder,
		Published: publish && source.Status == 1}
	if source.Requirements.Videos != 0 || source.Requirements.Audio != 0 || source.Requirements.Images < 1 || source.Requirements.Images > core.MaxTemplateImageSlots {
		return t, fmt.Errorf("暂不支持此模板的素材类型或图片位置数量")
	}
	if source.Options.Duration != float64(int(source.Options.Duration)) || source.Options.BatchCount > 1 {
		return t, fmt.Errorf("暂不支持小数时长或多视频批次")
	}
	optional := map[int]bool{}
	for _, n := range source.Requirements.OptionalImages {
		if n < 1 || n > source.Requirements.Images || optional[n] {
			return t, fmt.Errorf("选填图片位置无效或重复")
		}
		optional[n] = true
	}
	for i := 0; i < source.Requirements.Images; i++ {
		label := fmt.Sprintf("图片%d", i+1)
		if i < len(source.InputLabels.Images) && source.InputLabels.Images[i] != "" {
			label = source.InputLabels.Images[i]
		}
		t.ImageSlots = append(t.ImageSlots, core.TemplateImageSlot{Label: label, Optional: optional[i+1]})
		if !optional[i+1] {
			t.RequiredImages++
		}
	}
	mediaURL := func(raw string) string {
		u, err := url.Parse(raw)
		if raw == "" || err != nil {
			return raw
		}
		return origin.ResolveReference(u).String()
	}
	t.Cover, t.Preview = mediaURL(source.CoverURL), mediaURL(source.PreviewURL)
	t.Ratio, t.Resolution, t.Quality, t.Duration = source.Options.AspectRatio, source.Options.Resolution, source.Options.Quality, int(source.Options.Duration)
	t.Mode = map[string]string{"ref": "omni_ref", "flf": "keyframe", "i2v": "i2v", "t2v": "t2v"}[source.Mode]
	if t.Mode == "" {
		return t, fmt.Errorf("视频生成方式无法对应，请人工检查")
	}
	if source.ModelKey != "" {
		m, err := resolve(source.ModelKey)
		if err != nil {
			return t, err
		}
		t.Model = m.ID
		for _, r := range m.Resolutions {
			if strings.EqualFold(r, t.Resolution) {
				t.Resolution = r
				break
			}
		}
		if t.Mode == "i2v" && slices.Contains(m.Modes, "omni_ref") {
			t.Mode = "omni_ref"
		}
	} else if source.Status == 1 {
		return t, fmt.Errorf("已上架的来源模板缺少默认模型")
	}
	for _, reference := range source.SelectableModelKeys {
		m, err := resolve(reference)
		if err != nil {
			return t, err
		}
		if m.Kind != "video" {
			return t, fmt.Errorf("可选模型类型不匹配")
		}
		if m.ID != t.Model && !slices.Contains(t.SelectableModels, m.ID) {
			t.SelectableModels = append(t.SelectableModels, m.ID)
		}
	}
	return t, t.ValidateRecipe()
}
