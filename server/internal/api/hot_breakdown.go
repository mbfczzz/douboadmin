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

// 一键复刻 breakdown: the video model watches the user's saved copy of a hot
// video and returns its hook, shots and selling points. One result per video
// and model is shared by everyone; it runs in the background and the client
// polls GET. A run stuck for over 5 minutes, or a failed one, is started
// again by the next POST.
type breakdownRecord struct {
	VideoID    string            `json:"videoId"`
	Model      string            `json:"model"`
	Status     string            `json:"status"` // running | done | failed
	Result     *vision.Breakdown `json:"result"`
	Error      string            `json:"error"`
	StartedAt  time.Time         `json:"startedAt"`
	FinishedAt time.Time         `json:"finishedAt"`
}

const (
	breakdownStale   = 5 * time.Minute
	breakdownMaxSize = 50 << 20 // Ark takes video URLs up to 50 MB
)

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
	recordID := core.Digest(a.Vision.Model + ":" + id)[:32]
	row, err := a.Store.Get(r.Context(), "hot_breakdowns", recordID)
	if err != nil && !errors.Is(err, core.ErrNotFound) {
		dbError(w, err)
		return
	}
	var rec breakdownRecord
	_ = json.Unmarshal(row.Data, &rec)
	running := rec.Status == "running" && time.Since(rec.StartedAt) < breakdownStale
	if r.Method == "GET" || rec.Status == "done" || running {
		if err != nil {
			fail(w, 404, "这条视频还没有拆解")
			return
		}
		reply(w, 200, breakdownView(rec, running))
		return
	}
	var v struct {
		AssetID string `json:"assetId"`
	}
	if !decode(w, r, &v) {
		return
	}
	link, problem := a.breakdownSource(r.Context(), v.AssetID, identity(r).ID)
	if problem != "" {
		fail(w, 400, problem)
		return
	}
	rec = breakdownRecord{VideoID: id, Model: a.Vision.Model, Status: "running", StartedAt: time.Now().UTC()}
	if _, err := a.Store.Put(r.Context(), "hot_breakdowns", core.Record{ID: recordID, Data: core.Data(rec)}, row.Version); err != nil {
		if errors.Is(err, core.ErrConflict) { // another request just started it
			reply(w, 202, breakdownView(rec, true))
			return
		}
		dbError(w, err)
		return
	}
	go a.runBreakdown(recordID, rec, link)
	reply(w, 202, breakdownView(rec, true))
}

// breakdownSource signs the user's own saved copy of the video.
func (a *Server) breakdownSource(ctx context.Context, assetID, user string) (string, string) {
	row, err := a.Store.Get(ctx, "assets", assetID)
	var asset media.Asset
	if err != nil || row.Owner != user || json.Unmarshal(row.Data, &asset) != nil || !strings.HasPrefix(asset.Type, "video/") {
		return "", "原视频素材不可用"
	}
	if asset.Size > breakdownMaxSize {
		return "", "原视频超过 50 MB，无法拆解"
	}
	link, err := a.Media.InputURL(ctx, asset.Key)
	if err != nil {
		return "", err.Error()
	}
	return link, ""
}

func (a *Server) runBreakdown(recordID string, rec breakdownRecord, link string) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	result, err := a.Vision.Breakdown(ctx, link)
	rec.FinishedAt = time.Now().UTC()
	if err != nil {
		rec.Status, rec.Error = "failed", err.Error()
		slog.Warn("video breakdown failed", "video", rec.VideoID, "error", err.Error())
	} else {
		rec.Status, rec.Result = "done", &result
	}
	row, err := a.Store.Get(ctx, "hot_breakdowns", recordID)
	if err == nil {
		_, _ = a.Store.Put(ctx, "hot_breakdowns", core.Record{ID: recordID, Data: core.Data(rec)}, row.Version)
	}
}

func breakdownView(rec breakdownRecord, running bool) map[string]any {
	status := rec.Status
	if status == "running" && !running {
		status = "failed"
	}
	return map[string]any{"status": status, "result": rec.Result, "error": rec.Error}
}
