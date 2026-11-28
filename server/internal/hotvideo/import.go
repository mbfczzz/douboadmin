package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"doubo/server/internal/vision"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
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

// UploadSource is the source of a 一键复刻 from the user's own uploaded video.
func UploadSource(assetID string) string { return "u" + assetID }

// Why a post cannot be imported, said to the user as written (api keptNotes).
const (
	NoVideoImagePost = "这是图文作品，没有视频可以导入，一键复刻只支持视频，请换一条视频"
	NoVideoMP4       = "这条作品没有可用的 MP4 视频（可能是图文或特殊格式），请换一条视频"
)

// UploadTitle names an uploaded video the user gave no title: it says
// nothing about the content.
const UploadTitle = "我上传的视频"

// uploaded: the user's own video, kept as it is and broken down.
func (p Importer) uploaded(ctx context.Context, j core.Job) (string, error) {
	assetID := strings.TrimPrefix(j.Input.SourceID, "u")
	row, err := p.Service.Store.Get(ctx, "assets", assetID)
	var data map[string]any
	if err != nil || row.Owner != j.UserID || json.Unmarshal(row.Data, &data) != nil {
		return "", fmt.Errorf("上传的视频不可用")
	}
	if p.Vision.Ready() {
		p.breakdown(ctx, j, j.Input.SourceID, data)
	}
	return "asset:" + assetID, nil
}

func (p Importer) Generate(ctx context.Context, j core.Job) (string, error) {
	if j.Input.Purpose == RemakePurpose && strings.HasPrefix(j.Input.SourceID, "u") {
		return p.uploaded(ctx, j)
	}
	id := core.Digest(j.ID + ":result")[:32]
	if _, e := p.Service.Store.Get(ctx, "assets", id); e == nil {
		return "asset:" + id, nil
	}
	if !p.Service.Ready() {
		return "", fmt.Errorf("抖音数据接口尚未配置")
	}
	_ = p.Service.Store.Progress(ctx, j, 10, "获取无水印原视频")
	// The detail page has already resolved and cached this video. Reuse that
	// copy: asking TikHub for the same detail again can fail independently
	// (and would make a visible, playable video impossible to import).
	v, e := p.Service.Video(ctx, j.Input.SourceID)
	if e != nil {
		return "", e
	}
	if v.ImagePost {
		return "", errors.New(NoVideoImagePost)
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
	// The original upload need not be an MP4 (an iPhone .mov): Douyin's own
	// clean play copy is.
	if errors.Is(e, media.ErrResultType) && v.URL != "" && v.URL != source {
		result, e = p.Media.Save(ctx, saveJob, v.URL)
	}
	if errors.Is(e, media.ErrResultType) {
		return "", errors.New(NoVideoMP4)
	}
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
	size, _ := asset["size"].(float64)
	seconds, _ := asset["duration"].(float64)
	if seconds <= 0 {
		seconds = float64(j.Input.Duration) // the original's length the user saw
	}
	if key == "" || size > vision.FileLimit { // over 50 MB goes through 方舟's Files API
		return
	}
	_ = p.Service.Store.Progress(ctx, j, 70, "拆解原视频的钩子和分镜")
	source := func() (vision.Video, error) {
		url, err := p.Media.InputURL(ctx, key)
		video := vision.Link(url, int64(size))
		video.Seconds = seconds
		return video, err
	}
	if _, err := p.Service.EnsureBreakdown(ctx, p.Vision, videoID, source); err != nil {
		slog.Warn("video breakdown failed", "video", videoID, "error", err.Error())
	}
}
