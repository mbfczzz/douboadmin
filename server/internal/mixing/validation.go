package mixing

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strings"
)

func (e *Engine) model(ctx context.Context, id, kind string) (core.Model, error) {
	r, err := e.Store.Get(ctx, "models", id)
	if err != nil {
		return core.Model{}, fmt.Errorf("请选择已上架的生成模型")
	}
	var m core.Model
	if json.Unmarshal(r.Data, &m) != nil || !m.Effective().Usable() || m.Kind != kind {
		return m, fmt.Errorf("模型已下架或不可用")
	}
	return m.Effective(), nil
}
func (e *Engine) Validate(ctx context.Context, user string, in *core.JobInput, settings core.PlatformSettings) error {
	if !e.Ready() {
		return fmt.Errorf("混剪引擎尚未配置")
	}
	if in.Mix == nil || len(in.Assets) < 1 || len(in.Assets) > 10 {
		return fmt.Errorf("请添加 1–10 个图片或视频素材")
	}
	if in.Duration < 5 || in.Duration > 120 || !slices.Contains([]string{"9:16", "16:9", "1:1"}, in.Ratio) || !slices.Contains([]string{"720p", "1080p"}, in.Resolution) {
		return fmt.Errorf("混剪时长、比例或分辨率无效")
	}
	if !slices.Contains([]string{"", "clean", "rhythm", "cinematic"}, in.Style) {
		return fmt.Errorf("混剪风格无效")
	}
	if len([]rune(in.Prompt)) > 500 {
		return fmt.Errorf("混剪文案不能超过 500 字")
	}
	options := in.Mix
	if (options.Rewrite || options.Narration) && (e.AI == nil || !e.AI.Client.Ready()) {
		return fmt.Errorf("AI 改写与配音服务尚未配置")
	}
	if math.IsNaN(options.MusicVolume) || math.IsInf(options.MusicVolume, 0) || options.MusicVolume < 0 || options.MusicVolume > 1 {
		return fmt.Errorf("音乐音量无效")
	}
	if options.Transcribe && !e.ASR.Ready() {
		return fmt.Errorf("语音识别接口尚未配置，可先手动填写文案")
	}
	if !options.Transcribe && strings.TrimSpace(in.Prompt) == "" && (options.Rewrite || options.Narration || options.Captions) {
		return fmt.Errorf("请填写文案或启用语音识别")
	}
	var total int64
	seen := map[string]bool{}
	for _, id := range in.Assets {
		if seen[id] {
			return fmt.Errorf("请勿重复添加同一素材")
		}
		seen[id] = true
		r, err := e.Store.Get(ctx, "assets", id)
		if err != nil || r.Owner != user {
			return fmt.Errorf("素材不存在或无权限")
		}
		var asset struct {
			Type string `json:"type"`
			Size int64  `json:"size"`
		}
		if json.Unmarshal(r.Data, &asset) != nil || (!strings.HasPrefix(asset.Type, "image/") && asset.Type != "video/mp4") {
			return fmt.Errorf("混剪仅支持图片和 MP4 视频")
		}
		total += asset.Size
	}
	if total > 200<<20 {
		return fmt.Errorf("单次素材总大小不能超过 200 MB")
	}
	if options.Rewrite {
		if options.RewriteModel == "" {
			options.RewriteModel = settings.RewriteModel
		}
		if _, err := e.model(ctx, options.RewriteModel, "chat"); err != nil {
			return fmt.Errorf("请先在后台配置文案改写模型")
		}
	}
	if options.Narration {
		if options.TTSModel == "" {
			options.TTSModel = settings.TTSModel
		}
		model, err := e.model(ctx, options.TTSModel, "audio")
		if err != nil {
			return fmt.Errorf("请先在后台配置配音模型")
		}
		var schema struct {
			Voices []string `json:"voice"`
		}
		_ = json.Unmarshal(model.ParamsSchema, &schema)
		if len(schema.Voices) > 0 && !slices.Contains(schema.Voices, options.Voice) {
			return fmt.Errorf("请选择模型支持的配音音色")
		}
	}
	if options.MusicID != "" {
		id := options.MusicID
		owner := user
		if strings.HasPrefix(id, "asset:") {
			id = strings.TrimPrefix(id, "asset:")
		} else {
			r, err := e.Store.Get(ctx, "music", id)
			if err != nil {
				return fmt.Errorf("背景音乐不存在")
			}
			var music struct {
				AssetID   string `json:"assetId"`
				Published bool   `json:"published"`
			}
			_ = json.Unmarshal(r.Data, &music)
			if !music.Published {
				return fmt.Errorf("背景音乐已下架")
			}
			id = music.AssetID
			owner = r.Owner
		}
		r, err := e.Store.Get(ctx, "assets", id)
		if err != nil || r.Owner != owner {
			return fmt.Errorf("音乐素材不可用")
		}
		var asset struct {
			Type string `json:"type"`
		}
		_ = json.Unmarshal(r.Data, &asset)
		if !strings.HasPrefix(asset.Type, "audio/") {
			return fmt.Errorf("请选择音频作为背景音乐")
		}
	}
	in.Model = "local-mix"
	return nil
}
