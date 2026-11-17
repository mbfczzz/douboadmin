package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strings"
)

func validateTemplateContent(t core.Template) error {
	if strings.TrimSpace(t.Title) == "" || len([]rune(t.Title)) > 50 || strings.TrimSpace(t.Prompt) == "" || len([]rune(t.Prompt)) > core.MaxTemplatePromptChars || t.Sort < 0 {
		return fmt.Errorf("模板标题、提示词或排序无效")
	}
	return nil
}

func (a *Server) bindTemplateRecipe(ctx context.Context, in *core.JobInput) error {
	if in.TemplateID == "" {
		return nil
	}
	row, err := a.Store.Get(ctx, "templates", in.TemplateID)
	if err != nil {
		return fmt.Errorf("模板不存在，请重新打开")
	}
	var t core.Template
	if json.Unmarshal(row.Data, &t) != nil || t.Deleted || !t.Published || t.Kind != in.Kind {
		return fmt.Errorf("模板已变化，请重新打开")
	}
	if len(t.ImageSlots) == 0 {
		return nil
	}
	if err := t.ValidateRecipe(); err != nil {
		return fmt.Errorf("模板配方无效，请联系管理员检查")
	}
	m, err := a.model(ctx, in.Model)
	if err != nil || !t.AcceptsModel(m) || in.Ratio != t.Ratio || in.Duration != t.Duration {
		return fmt.Errorf("模板配置已变化，请重新打开确认")
	}
	if len(in.ImageSlots) != len(in.Assets) {
		return fmt.Errorf("请更新小程序后重新打开模板，按用途上传图片")
	}
	seen := map[string]bool{}
	for _, id := range in.Assets {
		if seen[id] {
			return fmt.Errorf("不同图片位置不能使用同一份素材")
		}
		seen[id] = true
		assetRow, err := a.Store.Get(ctx, "assets", id)
		var asset struct {
			Type string `json:"type"`
		}
		if err != nil || json.Unmarshal(assetRow.Data, &asset) != nil || !strings.HasPrefix(asset.Type, "image/") {
			return fmt.Errorf("模板图片位置只接受已上传的图片，请重新选择")
		}
	}
	prompt, err := t.ResolveImages(in.ImageSlots)
	if err != nil {
		return err
	}
	in.Prompt, in.Mode = prompt, t.Mode
	return nil
}

func (a *Server) hideTemplateRecipe(ctx context.Context, j *core.Job) {
	actor, _ := ctx.Value(identityKey).(Identity)
	if actor.Role == "admin" || j.Input.TemplateID == "" {
		return
	}
	row, err := a.Store.Get(ctx, "templates", j.Input.TemplateID)
	if err == nil {
		var t core.Template
		if json.Unmarshal(row.Data, &t) == nil && len(t.ImageSlots) > 0 {
			j.Input.Prompt = ""
		}
	}
}
