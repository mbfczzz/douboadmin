package api

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// referenceClip: 一键复刻 hands the video model the original video as @视频1.
// Video models take short references (火山方舟: Seedance 2.0 up to 15 s, 2.5
// up to 30 s) and the original's sound can fail the provider's content
// review, so the reference is the original's first N seconds without audio
// (POST /api/assets/{id}/reference-clip {seconds}). Made once per video and
// length with ffmpeg (stream copy, no re-encoding) and kept as the user's own
// asset. A server without ffmpeg answers with the original, as before.
func (a *Server) referenceClip(w http.ResponseWriter, r *http.Request) {
	ctx, user := r.Context(), identity(r).ID
	var body struct {
		Seconds int `json:"seconds"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body) != nil || body.Seconds < 1 || body.Seconds > 60 {
		fail(w, 400, "参考视频时长无效")
		return
	}
	row, err := a.Store.Get(ctx, "assets", r.PathValue("id"))
	var src struct {
		Key  string `json:"key"`
		Type string `json:"type"`
	}
	if err != nil || row.Owner != user || json.Unmarshal(row.Data, &src) != nil || src.Key == "" || !strings.HasPrefix(src.Type, "video/") {
		fail(w, 404, "参考视频不存在或已删除")
		return
	}
	id := core.Digest(user + ":reference-clip:" + row.ID + ":" + strconv.Itoa(body.Seconds))[:32]
	clip, err := a.Store.Get(ctx, "assets", id)
	if err != nil {
		clip, err = a.cutClip(ctx, user, id, src.Key, body.Seconds)
		if errors.Is(err, exec.ErrNotFound) {
			slog.Warn("ffmpeg is not installed; 一键复刻 sends the whole original video")
			clip, err = row, nil
		}
	}
	if err == nil {
		clip, err = a.signedAsset(ctx, clip)
	}
	if err != nil {
		slog.Error("reference clip", "asset", row.ID, "error", err)
		fail(w, 502, "参考视频处理失败，请稍后重试")
		return
	}
	reply(w, 200, clip)
}

// cutClip keeps the first seconds of the video stream (no audio) and stores it.
func (a *Server) cutClip(ctx context.Context, user, id, key string, seconds int) (core.Record, error) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		return core.Record{}, err
	}
	dir, err := os.MkdirTemp("", "reference-clip-")
	if err != nil {
		return core.Record{}, err
	}
	defer os.RemoveAll(dir)
	input := filepath.Join(a.Config.MediaDir, filepath.FromSlash(key))
	if a.Objects != nil {
		// Fetched here, not by ffmpeg: a static ffmpeg build cannot resolve
		// host names (it crashed reading the OSS link), and a local file needs
		// no network or TLS support in ffmpeg at all.
		if input, err = a.fetchOriginal(ctx, key, filepath.Join(dir, "source")); err != nil {
			return core.Record{}, err
		}
	}
	out := filepath.Join(dir, "clip.mp4")
	run, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	var stderr bytes.Buffer
	cmd := exec.CommandContext(run, ffmpeg, "-nostdin", "-loglevel", "error", "-t", strconv.Itoa(seconds), "-i", input,
		"-map", "0:v:0", "-c", "copy", "-an", "-movflags", "+faststart", "-f", "mp4", out)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return core.Record{}, errors.New(strings.TrimSpace(err.Error() + " " + stderr.String()))
	}
	data, err := os.ReadFile(out)
	if err != nil || len(data) == 0 {
		return core.Record{}, errors.New("ffmpeg produced no clip")
	}
	clipKey, url := "uploads/"+user+"/"+id+".mp4", ""
	if a.Objects != nil {
		err = a.Objects.Put(ctx, clipKey, bytes.NewReader(data), "video/mp4")
	} else {
		full := filepath.Join(a.Config.MediaDir, filepath.FromSlash(clipKey))
		if err = os.MkdirAll(filepath.Dir(full), 0o700); err == nil {
			err = os.WriteFile(full, data, 0o600)
		}
		url = "/media/" + clipKey
	}
	if err != nil {
		return core.Record{}, err
	}
	asset := map[string]any{"name": "参考片段（前 " + strconv.Itoa(seconds) + " 秒，无声）", "url": url, "key": clipKey, "type": "video/mp4", "size": len(data)}
	rec, err := a.Store.Put(ctx, "assets", core.Record{ID: id, Owner: user, Data: core.Data(asset)}, 0)
	if err == core.ErrConflict {
		return a.Store.Get(ctx, "assets", id)
	}
	return rec, err
}

// fetchOriginal copies the stored video to path (at most 200 MB).
func (a *Server) fetchOriginal(ctx context.Context, key, path string) (string, error) {
	url, err := a.Objects.URL(ctx, key)
	if err != nil {
		return "", err
	}
	get, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	req, err := http.NewRequestWithContext(get, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download original: HTTP %d", res.StatusCode)
	}
	out, err := os.Create(path)
	if err != nil {
		return "", err
	}
	n, err := io.Copy(out, io.LimitReader(res.Body, 200<<20+1))
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err == nil && n > 200<<20 {
		err = errors.New("original video is over 200 MB")
	}
	return path, err
}
