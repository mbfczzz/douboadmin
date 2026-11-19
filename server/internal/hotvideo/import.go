package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"doubo/server/internal/vision"
	"encoding/json"
	"fmt"
	"log/slog"
)

type Importer struct {
	Service *Service
	Media   *media.Service
	// Vision breaks the video down when the import prepares a 一键复刻
	// (Purpose "remake"); nil or unconfigured skips that step.
	Vision *vision.Client
}

// RemakePurpose marks an import that prepares a 一键复刻.
const RemakePurpose = "remake"

func (p Importer) Generate(ctx context.Context, j core.Job) (string, error) {
	id := core.Digest(j.ID + ":result")[:32]
	if _, e := p.Service.Store.Get(ctx, "assets", id); e == nil {
		return "asset:" + id, nil
	}
	if !p.Service.Ready() {
		return "", fmt.Errorf("抖音数据接口尚未配置")
	}
	_ = p.Service.Store.Progress(ctx, j, 10, "获取无水印原视频")
	v, e := p.Service.Client.Detail(ctx, j.Input.SourceID)
	if e != nil {
		return "", e
	}
	// The original upload has no watermark; when TikHub cannot give it
	// (blue-V or promoted videos) the clean play address is used.
	source := v.URL
	if original, e := p.Service.Client.OriginalURL(ctx, v.ID); e == nil {
		source = original
	}
	if source == "" {
		return "", fmt.Errorf("数据源未提供可导入的视频地址")
	}
	_ = p.Service.Store.Progress(ctx, j, 30, "下载视频素材")
	saveJob := j
	saveJob.Input.Kind = "video"
	result, e := p.Media.Save(ctx, saveJob, source)
	if e != nil {
		return "", e
	}
	row, e := p.Service.Store.Get(ctx, "assets", id)
	if e != nil {
		return "", e
	}
	var data map[string]any
	_ = json.Unmarshal(row.Data, &data)
	data["name"] = v.Title
	data["sourceUrl"] = v.SourceURL
	data["sourceVideoId"] = v.ID
	row.Data = core.Data(data)
	if _, e = p.Service.Store.Put(ctx, "assets", row, row.Version); e != nil && e != core.ErrConflict {
		return "", e
	}
	if j.Input.Purpose == RemakePurpose && p.Vision.Ready() {
		p.breakdown(ctx, j, v.ID, data)
	}
	return result, nil
}

// breakdown is best effort: the remake goes on from the caption without it.
func (p Importer) breakdown(ctx context.Context, j core.Job, videoID string, asset map[string]any) {
	key, _ := asset["key"].(string)
	if size, _ := asset["size"].(float64); key == "" || size > 50<<20 { // Ark takes up to 50 MB by URL
		return
	}
	_ = p.Service.Store.Progress(ctx, j, 70, "拆解原视频的钩子和分镜")
	if _, err := p.Service.EnsureBreakdown(ctx, p.Vision, videoID, func() (string, error) { return p.Media.InputURL(ctx, key) }); err != nil {
		slog.Warn("video breakdown failed", "video", videoID, "error", err.Error())
	}
}
