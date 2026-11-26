package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const errReferenceLength = core.ReferenceVideoError("参考视频时长读取失败，请换一个 MP4 视频")

// referenceSeconds lists the length of every reference video of a job (for
// 参考视频计费 and 火山方舟's token estimate). A video is measured once and the
// length kept on its asset record.
func (a *Server) referenceSeconds(ctx context.Context, in core.JobInput) ([]float64, error) {
	var out []float64
	for _, id := range in.Assets {
		row, err := a.Store.Get(ctx, "assets", id)
		if err != nil {
			return nil, err
		}
		var asset struct {
			Key      string   `json:"key"`
			Type     string   `json:"type"`
			Duration *float64 `json:"duration"`
		}
		if json.Unmarshal(row.Data, &asset) != nil || !strings.HasPrefix(asset.Type, "video/") {
			continue
		}
		if asset.Duration == nil {
			seconds, err := a.measureVideo(ctx, asset.Key)
			if err != nil {
				slog.Warn("reference video length", "asset", row.ID, "error", err)
				return nil, errReferenceLength
			}
			asset.Duration = &seconds
			a.keepDuration(ctx, row, seconds)
		}
		out = append(out, *asset.Duration)
	}
	return out, nil
}

// measureVideo reads the stored file's length (OSS copies are fetched first).
func (a *Server) measureVideo(ctx context.Context, key string) (float64, error) {
	path := filepath.Join(a.Config.MediaDir, filepath.FromSlash(key))
	if a.Objects != nil {
		dir, err := os.MkdirTemp("", "reference-length-")
		if err != nil {
			return 0, err
		}
		defer os.RemoveAll(dir)
		if path, err = a.fetchOriginal(ctx, key, filepath.Join(dir, "video")); err != nil {
			return 0, err
		}
	}
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	return media.MP4Duration(f)
}

// keepDuration saves the measured length; a concurrent edit just means the
// next quote measures again.
func (a *Server) keepDuration(ctx context.Context, row core.Record, seconds float64) {
	var data map[string]any
	if json.Unmarshal(row.Data, &data) != nil {
		return
	}
	data["duration"] = seconds
	row.Data = core.Data(data)
	if _, err := a.Store.Put(ctx, "assets", row, row.Version); err != nil && !errors.Is(err, core.ErrConflict) {
		slog.Warn("keep reference video length", "asset", row.ID, "error", err)
	}
}

// quoteError: 参考视频计费 problems are the user's to fix (400).
func quoteError(w http.ResponseWriter, err error) {
	var ref core.ReferenceVideoError
	if errors.As(err, &ref) {
		fail(w, 400, ref.Error())
		return
	}
	dbError(w, err)
}

// assetCounts counts a job's references by kind (image, video, audio).
func (a *Server) assetCounts(ctx context.Context, in core.JobInput) map[string]int {
	counts := map[string]int{}
	for _, id := range in.Assets {
		var asset struct {
			Type string `json:"type"`
		}
		if row, err := a.Store.Get(ctx, "assets", id); err == nil && json.Unmarshal(row.Data, &asset) == nil {
			counts[strings.Split(asset.Type, "/")[0]]++
		}
	}
	return counts
}

// checkReferenceLengths refuses, before any model is called, a reference
// video longer than the model takes (模型配置 → 参考视频时长, else the
// official limit: Seedance 2.0 15 s, 2.5 30 s), naming it so the user can cut
// it. A video whose length cannot be read is left to the model.
func (a *Server) checkReferenceLengths(ctx context.Context, m core.Model, in core.JobInput) error {
	seconds, err := a.referenceSeconds(ctx, in)
	if err != nil {
		slog.Warn("reference video length unknown", "model", m.ID, "error", err)
		return nil
	}
	limit := core.RefVideoSeconds(m)
	for i, n := range seconds {
		if n > float64(limit) {
			return fmt.Errorf("参考视频%d 时长 %s 秒，%s 最长只能参考 %d 秒，请剪短后再提交", i+1, strconv.FormatFloat(math.Ceil(n*10)/10, 'f', -1, 64), m.Name, limit)
		}
	}
	return nil
}

// referenceWindow: the first look at an older video's length (saved before
// lengths were recorded) fetches it, which can outlast the server's
// 90-second window; the mini-program waits up to 3 minutes for these.
const referenceWindow = 3 * time.Minute

func allowReferenceReads(w http.ResponseWriter, assets []string) {
	if len(assets) > 0 {
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(referenceWindow))
	}
}
