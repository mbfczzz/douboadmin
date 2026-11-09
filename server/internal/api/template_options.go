package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
)

func httpsURL(s string) bool {
	u, e := url.Parse(s)
	return e == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}

func (a *Server) validateTemplate(r *http.Request, t *core.Template) error {
	if t.Family == "" {
		t.Family = "style"
	}
	if !slices.Contains([]string{"style", "inspiration"}, t.Family) {
		return fmt.Errorf("模板类型无效")
	}
	if t.CoverAssetID != "" {
		row, err := a.Store.Get(r.Context(), "assets", t.CoverAssetID)
		if err != nil || !a.adminAsset(r, row.Owner) {
			return fmt.Errorf("封面素材不可用，请重新上传")
		}
		var v struct {
			Type string `json:"type"`
		}
		_ = json.Unmarshal(row.Data, &v)
		if !slices.Contains([]string{"image/jpeg", "image/png", "image/webp"}, v.Type) {
			return fmt.Errorf("封面必须是图片")
		}
		t.Cover = ""
	} else if !httpsURL(t.Cover) {
		return fmt.Errorf("请上传封面或填写 HTTPS 图片地址")
	}
	if t.Preview != "" && !httpsURL(t.Preview) {
		return fmt.Errorf("预览视频请使用 HTTPS 地址")
	}
	if len([]rune(t.Description)) > 500 || len([]rune(t.Category)) > 40 || len(t.Cover) > 3000 || len(t.Preview) > 3000 {
		return fmt.Errorf("模板字段过长")
	}
	if t.Model == "" {
		if t.Published {
			return fmt.Errorf("发布前请选择生成模型")
		}
		return nil
	}
	m, err := a.model(r.Context(), t.Model)
	if err != nil || m.Deleted || m.Kind != t.Kind {
		return fmt.Errorf("关联模型无效")
	}
	if t.Published && !m.Usable() {
		return fmt.Errorf("发布前请先上架关联模型")
	}
	if (len(m.Resolutions) > 0 && !slices.Contains(m.Resolutions, t.Resolution)) || (len(m.Ratios) > 0 && !slices.Contains(m.Ratios, t.Ratio)) || (len(m.Qualities) > 0 && !slices.Contains(m.Qualities, t.Quality)) {
		return fmt.Errorf("模板参数与模型不匹配")
	}
	if t.Kind == "video" && !slices.Contains(m.Durations, t.Duration) {
		return fmt.Errorf("模板视频时长无效")
	}
	mode := t.Mode
	if mode == "" {
		if t.Kind == "image" {
			mode = "t2i"
			if t.RequiredImages > 0 {
				mode = "i2i"
			}
		} else {
			mode = "t2v"
			if t.RequiredImages == 1 {
				mode = "i2v"
			}
			if t.RequiredImages > 1 {
				mode = "omni_ref"
			}
		}
		t.Mode = mode
	}
	if len(m.Modes) > 0 && !slices.Contains(m.Modes, mode) {
		return fmt.Errorf("模型不支持模板的生成方式")
	}
	if (mode == "i2v" && t.RequiredImages != 1) || (mode == "keyframe" && t.RequiredImages != 2) || (slices.Contains([]string{"t2i", "t2v"}, mode) && t.RequiredImages != 0) {
		return fmt.Errorf("模板参考图数量与生成方式不一致")
	}
	return templateImageLimits(m, mode, t.RequiredImages)
}

// templateImageLimits keeps a template's required image count inside what its
// model accepts at submit time; otherwise the template could never be used.
func templateImageLimits(m core.Model, mode string, n int) error {
	if n == 0 {
		return nil
	}
	var schema relay.Schema
	_ = json.Unmarshal(m.ParamsSchema, &schema)
	max, limited := schema.EditImages.Max, m.Kind == "image" && schema.EditImages.Max > 0
	if mode == "omni_ref" {
		// Submit enforces any listed image limit, including 0.
		var raw json.RawMessage
		if raw, limited = schema.RefLimits["image"]; limited {
			max = 0
			_ = json.Unmarshal(raw, &max)
		}
	}
	if limited && n > max {
		return fmt.Errorf("该模型最多支持 %d 张参考图，请调整模板要求的图片数量", max)
	}
	if mode == "i2i" && n < schema.EditImages.Min {
		return fmt.Errorf("该模型至少需要 %d 张参考图，请调整模板要求的图片数量", schema.EditImages.Min)
	}
	if validateModelReferences(m, mode, map[string]int{"image": n}, nil) != nil {
		return fmt.Errorf("模板要求的图片数量超过模型配置的参考图上限")
	}
	return nil
}

func (a *Server) templateCover(r *http.Request, t *core.Template) {
	if t.CoverAssetID == "" {
		return
	}
	row, err := a.Store.Get(r.Context(), "assets", t.CoverAssetID)
	if err != nil {
		return
	}
	var v struct {
		URL string `json:"url"`
		Key string `json:"key"`
	}
	_ = json.Unmarshal(row.Data, &v)
	t.Cover = v.URL
	if a.Objects != nil {
		if u, e := a.Objects.URL(r.Context(), v.Key); e == nil {
			t.Cover = u
		}
	}
}

// adminAsset: covers uploaded by any admin can be reused by other admins
// (templates are shared); assets uploaded by mini-program users cannot.
func (a *Server) adminAsset(r *http.Request, owner string) bool {
	if owner == identity(r).ID {
		return true
	}
	_, err := a.Store.Get(r.Context(), "admin_accounts", owner)
	return err == nil
}
