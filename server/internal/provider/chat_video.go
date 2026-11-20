package provider

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Chat models cannot watch videos. A video a message names is watched once
// by the 视频理解 model (the one 一键复刻 uses) and passed on as text; the
// note is kept per video, so asking about it again is instant.

const (
	videoNoteRunes = 1500     // within billing's per-material allowance
	videoMaxBytes  = 50 << 20 // 方舟 reads video URLs up to 50 MB
)

type videoNote struct {
	Model string    `json:"model"`
	Note  string    `json:"note"`
	At    time.Time `json:"at"`
}

// videoNote is what the chat model is told about one video.
func (p *DirectChat) videoNote(ctx context.Context, j core.Job, assetID, url string) string {
	label := materialLabel(ctx, p, j, assetID)
	if !p.Vision.Ready() {
		return "【" + label + "】视频理解未配置，看不到这个视频的画面；请如实告诉用户，并请用户描述视频内容。"
	}
	var version int64 // an older note (another 视频理解 model) is replaced
	if row, err := p.Store.Get(ctx, "video_notes", assetID); err == nil {
		version = row.Version
		var n videoNote
		if json.Unmarshal(row.Data, &n) == nil && n.Model == p.Vision.Model && n.Note != "" {
			return "【" + label + " 的内容（由视频理解模型观看后整理）】\n" + n.Note
		}
	}
	if size := assetSize(ctx, p, assetID); size > videoMaxBytes {
		return "【" + label + "】视频超过 50MB，无法观看；请告诉用户剪短或压缩后重新上传。"
	}
	_ = p.Store.Progress(ctx, j, 5, "正在观看"+label+"…")
	b, err := p.Vision.Breakdown(ctx, url)
	if err != nil {
		return "【" + label + "】这次没能看懂这个视频（" + err.Error() + "）；请如实告诉用户，可稍后重试。"
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
	n := videoNote{Model: p.Vision.Model, Note: string(note), At: time.Now().UTC()}
	_, _ = p.Store.Put(ctx, "video_notes", core.Record{ID: assetID, Owner: j.UserID, Data: core.Data(n)}, version)
	_ = p.Store.Progress(ctx, j, 10, "")
	return "【" + label + " 的内容（由视频理解模型观看后整理）】\n" + n.Note
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
