package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
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
const breakdownMaxSize = 50 << 20 // Ark takes video URLs up to 50 MB

func (a *Server) hotBreakdown(w http.ResponseWriter, r *http.Request) {
	if !a.Vision.Ready() {
		fail(w, 503, "视频理解未配置")
		return
	}
	id := r.PathValue("id")
	if !videoID.MatchString(id) {
		fail(w, 400, "视频标识无效")
		return
	}
	rec, _, err := a.Hot.ReadBreakdown(r.Context(), a.Vision.Model, id)
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
	key, problem := a.breakdownAsset(r.Context(), v.AssetID, identity(r).ID)
	if problem != "" {
		fail(w, 400, problem)
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if _, err := a.Hot.EnsureBreakdown(ctx, a.Vision, id, func() (string, error) { return a.Media.InputURL(ctx, key) }); err != nil {
			slog.Warn("video breakdown failed", "video", id, "error", err.Error())
		}
	}()
	reply(w, 202, breakdownView("running", true, nil, ""))
}

// breakdownAsset checks the caller's own saved copy of the video.
func (a *Server) breakdownAsset(ctx context.Context, assetID, user string) (string, string) {
	row, err := a.Store.Get(ctx, "assets", assetID)
	var asset media.Asset
	if err != nil || row.Owner != user || json.Unmarshal(row.Data, &asset) != nil || !strings.HasPrefix(asset.Type, "video/") {
		return "", "原视频素材不可用"
	}
	if asset.Size > breakdownMaxSize {
		return "", "原视频超过 50 MB，无法拆解"
	}
	return asset.Key, ""
}

func breakdownView(status string, active bool, result any, problem string) map[string]any {
	if status == "running" && !active {
		status = "failed"
	}
	return map[string]any{"status": status, "result": result, "error": problem}
}
