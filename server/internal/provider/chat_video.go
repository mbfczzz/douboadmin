package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/vision"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Chat models cannot watch videos. A video a message names is watched once
// by the 视频理解 model (the one 一键复刻 uses) and passed on as text; the
// note is kept per video, so asking about it again is instant.

const (
	videoNoteRunes = 1500             // within billing's per-material allowance
	videoMaxBytes  = vision.FileLimit // over 50 MB is uploaded through 方舟's Files API
	videoNoteStale = 10 * time.Minute // a large video is uploaded before it is watched
	videoNoteRetry = 5 * time.Minute  // a failed video is not watched again sooner
	videoNotePoll  = 500 * time.Millisecond
)

type videoNote struct {
	Model     string    `json:"model"`
	Status    string    `json:"status"` // running | done | failed
	Note      string    `json:"note"`
	Error     string    `json:"error"`
	StartedAt time.Time `json:"startedAt"`
	At        time.Time `json:"at"`
}

// videoNote is what the chat model is told about one video.
func (p *DirectChat) videoNote(ctx context.Context, j core.Job, assetID, url string) string {
	label := materialLabel(ctx, p, j, assetID)
	if !p.Vision.Ready() {
		return "【" + label + "】暂时看不到这个视频的画面；请告诉用户暂时无法查看视频，并请用户描述视频内容，不要提及任何配置或服务原因。"
	}
	modelID := p.Vision.ModelID()
	size := assetSize(ctx, p, assetID)
	if size > videoMaxBytes {
		return "【" + label + "】视频超过 512MB，无法观看；请告诉用户剪短或压缩后重新上传。"
	}
	for {
		row, err := p.Store.Get(ctx, "video_notes", assetID)
		var n videoNote
		if err == nil {
			_ = json.Unmarshal(row.Data, &n)
			// Notes saved before status existed are finished ones too.
			if n.Model == modelID && (n.Status == "done" || n.Status == "") && n.Note != "" {
				return videoNoteText(label, n.Note)
			}
			if n.Model == modelID && n.Status == "failed" && time.Since(n.At) < videoNoteRetry {
				return videoNoteFailure(label)
			}
			if n.Model == modelID && n.Status == "running" && time.Since(n.StartedAt) < videoNoteStale {
				select {
				case <-ctx.Done():
					return videoNoteFailure(label)
				case <-time.After(videoNotePoll):
				}
				continue
			}
		} else if !errors.Is(err, core.ErrNotFound) {
			return videoNoteFailure(label)
		}
		claim := videoNote{Model: modelID, Status: "running", StartedAt: time.Now().UTC()}
		claimed, err := p.Store.Put(ctx, "video_notes", core.Record{ID: assetID, Owner: j.UserID, Data: core.Data(claim)}, row.Version)
		if errors.Is(err, core.ErrConflict) {
			continue
		}
		if err != nil {
			return videoNoteFailure(label)
		}
		return p.watchVideoNote(ctx, j, label, vision.Link(url, size), claimed, claim)
	}
}

func (p *DirectChat) watchVideoNote(ctx context.Context, j core.Job, label string, video vision.Video, row core.Record, n videoNote) string {
	_ = p.Store.Progress(ctx, j, 5, "正在观看"+label+"…")
	b, err := p.Vision.Breakdown(ctx, video)
	if err != nil {
		n.Status, n.Error, n.At = "failed", err.Error(), time.Now().UTC()
		p.saveVideoNote(ctx, row, n)
		return videoNoteFailure(label)
	}
	lines := []string{"概要：" + b.Summary, "开头：" + b.Hook, "结构：" + b.Structure, "风格：" + b.Style}
	if b.Music != "" {
		lines = append(lines, "声音："+b.Music)
	}
	if len(b.SellingPoints) > 0 {
		lines = append(lines, "亮点："+strings.Join(b.SellingPoints, "；"))
	}
	for _, s := range b.Shots {
		shot := fmt.Sprintf("%g–%g秒 %s，%s", s.Start, s.End, s.Scene, s.Action)
		if s.Speech != "" {
			shot += "（台词：" + s.Speech + "）"
		}
		lines = append(lines, shot)
	}
	note := []rune(strings.Join(lines, "\n"))
	if len(note) > videoNoteRunes {
		note = note[:videoNoteRunes]
	}
	n.Status, n.Note, n.Error, n.At = "done", string(note), "", time.Now().UTC()
	p.saveVideoNote(ctx, row, n)
	_ = p.Store.Progress(ctx, j, 10, "")
	return videoNoteText(label, n.Note)
}

func (p *DirectChat) saveVideoNote(ctx context.Context, row core.Record, n videoNote) {
	done, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	row.Data = core.Data(n)
	_, _ = p.Store.Put(done, "video_notes", row, row.Version)
}

func videoNoteText(label, note string) string {
	return "【" + label + " 的内容（由视频理解模型观看后整理）】\n" + note
}

func videoNoteFailure(label string) string {
	return "【" + label + "】这次暂时没能读取视频画面；请如实告诉用户稍后再试，不要提及内部原因。"
}

// materialLabel is the name the user sees: 视频2 is the project's second
// video, 图片3 its third picture (as plans refer to them).
func materialLabel(ctx context.Context, p *DirectChat, j core.Job, assetID string) string {
	word := map[string]string{"image": "图片", "video": "视频"}[assetType(ctx, p, assetID)]
	if word == "" {
		word = "素材"
	}
	session, err := loadSession(ctx, p.Store, j)
	if err != nil {
		return word
	}
	n, typ := 0, assetType(ctx, p, assetID)
	for _, id := range session.Assets {
		if assetType(ctx, p, id) == typ {
			n++
		}
		if id == assetID {
			return fmt.Sprintf("%s%d", word, n)
		}
	}
	return word
}

func assetType(ctx context.Context, p *DirectChat, id string) string {
	var a struct {
		Type string `json:"type"`
	}
	if row, err := p.Store.Get(ctx, "assets", id); err == nil {
		_ = json.Unmarshal(row.Data, &a)
	}
	return strings.Split(a.Type, "/")[0]
}

func assetSize(ctx context.Context, p *DirectChat, id string) int64 {
	var a struct {
		Size int64 `json:"size"`
	}
	if row, err := p.Store.Get(ctx, "assets", id); err == nil {
		_ = json.Unmarshal(row.Data, &a)
	}
	return a.Size
}
