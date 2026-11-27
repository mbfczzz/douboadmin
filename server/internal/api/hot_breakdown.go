package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"doubo/server/internal/vision"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// 一键复刻 breakdown (hotvideo/breakdown.go): GET reads the shared result;
// POST starts it in the background from the caller's own saved copy when
// nobody has. The remake preparation job normally runs it already.
func (a *Server) hotBreakdown(w http.ResponseWriter, r *http.Request) {
	if !a.Vision.Ready() {
		fail(w, 503, "视频拆解暂未开放")
		return
	}
	id := r.PathValue("id")
	// A Douyin video's breakdown is shared; an uploaded one ("u" + asset id)
	// is its owner's alone.
	if upload := uploadID.MatchString(id); !videoID.MatchString(id) && !upload {
		fail(w, 400, "视频标识无效")
		return
	} else if _, _, problem := a.breakdownAsset(r.Context(), id[1:], identity(r).ID); upload && problem != "" {
		fail(w, 404, "视频不存在")
		return
	}
	rec, err := a.Hot.SavedBreakdown(r.Context(), a.Vision.ModelID(), id)
	if err != nil && !errors.Is(err, core.ErrNotFound) {
		dbError(w, err)
		return
	}
	if r.Method == "GET" || rec.Status == "done" || rec.Active() {
		if err != nil {
			fail(w, 404, "这条视频还没有拆解")
			return
		}
		reply(w, 200, breakdownView(rec.Status, rec.Active(), rec.Result, rec.Error))
		return
	}
	var v struct {
		AssetID string `json:"assetId"`
	}
	if !decode(w, r, &v) {
		return
	}
	key, size, problem := a.breakdownAsset(r.Context(), v.AssetID, identity(r).ID)
	if problem == "" && !a.copyOf(r.Context(), v.AssetID, id) {
		problem = "原视频素材不可用"
	}
	seconds := a.assetSeconds(r.Context(), v.AssetID)
	if problem != "" {
		fail(w, 400, problem)
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute) // a large video is uploaded first
		defer cancel()
		source := func() (vision.Video, error) {
			url, err := a.Media.InputURL(ctx, key)
			video := vision.Link(url, size)
			video.Seconds = seconds
			return video, err
		}
		if _, err := a.Hot.EnsureBreakdown(ctx, a.Vision, id, source); err != nil {
			slog.Warn("video breakdown failed", "video", id, "error", err.Error())
		}
	}()
	reply(w, 202, breakdownView("running", true, nil, ""))
}

// breakdownAsset checks the caller's own saved copy of the video.
func (a *Server) breakdownAsset(ctx context.Context, assetID, user string) (string, int64, string) {
	row, err := a.Store.Get(ctx, "assets", assetID)
	var asset media.Asset
	if err != nil || row.Owner != user || json.Unmarshal(row.Data, &asset) != nil || !strings.HasPrefix(asset.Type, "video/") {
		return "", 0, "原视频素材不可用"
	}
	if asset.Size > vision.FileLimit { // over 50 MB is uploaded through 方舟's Files API
		return "", 0, "原视频超过 512 MB，无法拆解"
	}
	return asset.Key, asset.Size, ""
}

// copyOf: the breakdown is shared by everyone, so it is made only from the
// user's saved copy of that very video (the upload itself for "u" ids).
func (a *Server) copyOf(ctx context.Context, assetID, videoID string) bool {
	if strings.HasPrefix(videoID, "u") {
		return videoID[1:] == assetID
	}
	var asset struct {
		SourceVideoID string `json:"sourceVideoId"`
	}
	row, err := a.Store.Get(ctx, "assets", assetID)
	return err == nil && json.Unmarshal(row.Data, &asset) == nil && asset.SourceVideoID == videoID
}

// assetSeconds is the video's length when it was read at upload (0: unknown).
func (a *Server) assetSeconds(ctx context.Context, id string) float64 {
	var asset media.Asset
	if row, err := a.Store.Get(ctx, "assets", id); err == nil {
		_ = json.Unmarshal(row.Data, &asset)
	}
	return asset.Duration
}

// The vision service's own words (keys, quota, upstream errors) stay in the
// log ("video breakdown failed"); users see that it failed.
func breakdownView(status string, active bool, result any, problem string) map[string]any {
	if status == "running" && !active {
		status = "failed"
	}
	if problem != "" {
		problem = "视频拆解失败，请稍后重试"
	}
	return map[string]any{"status": status, "result": result, "error": problem}
}
