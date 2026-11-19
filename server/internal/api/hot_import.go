package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/media"
	"encoding/json"
	"net/http"
	"strings"
)

// importHot saves a hot video without watermark into the user's materials.
// With purpose "remake" it prepares a 一键复刻 in the task queue: the job
// also breaks the video down, and keeps the user's own pictures (assets)
// and the original's title, caption and length for the editor.
func (a *Server) importHot(w http.ResponseWriter, r *http.Request) {
	if !a.Hot.Ready() {
		fail(w, 503, "抖音数据接口尚未配置")
		return
	}
	id := r.PathValue("id")
	if !videoID.MatchString(id) {
		fail(w, 400, "视频标识无效")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) < 8 || len(key) > 128 {
		fail(w, 400, "请提供导入请求标识")
		return
	}
	var v struct {
		Purpose  string   `json:"purpose"`
		Assets   []string `json:"assets"`
		Title    string   `json:"title"`
		Text     string   `json:"text"`
		Duration int      `json:"duration"`
	}
	if !decode(w, r, &v) {
		return
	}
	in := core.JobInput{Kind: "import", Model: "hot-import", Prompt: "导入抖音视频素材", SourceID: id}
	if v.Purpose == hotvideo.RemakePurpose {
		if len(v.Assets) > 3 || v.Duration < 0 || v.Duration > 3600 {
			fail(w, 400, "复刻参数无效")
			return
		}
		for _, asset := range v.Assets {
			if !a.ownImage(r.Context(), asset, identity(r).ID) {
				fail(w, 400, "替换用的图片不可用")
				return
			}
		}
		in.Purpose, in.Assets, in.Duration = v.Purpose, v.Assets, v.Duration
		in.Prompt = remakePrompt(v.Title, v.Text)
	} else if v.Purpose != "" {
		fail(w, 400, "导入用途无效")
		return
	}
	job := core.NewJob(identity(r).ID, key, in)
	job.ActivationRequired = a.Config.RequireActivation
	j, e := a.Store.CreateJob(r.Context(), job)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 202, j)
}

// The task's title line, then the original's caption (for the editor).
func remakePrompt(title, text string) string {
	cut := func(s string, n int) string {
		s = strings.TrimSpace(s)
		if r := []rune(s); len(r) > n {
			return string(r[:n])
		}
		return s
	}
	title, text = cut(title, 100), cut(text, 500)
	if title == "" {
		title = "抖音视频"
	}
	prompt := "一键复刻：" + title
	if text != "" && text != title {
		prompt += "\n" + text
	}
	return prompt
}

func (a *Server) ownImage(ctx context.Context, assetID, user string) bool {
	row, err := a.Store.Get(ctx, "assets", assetID)
	var asset media.Asset
	return err == nil && row.Owner == user && json.Unmarshal(row.Data, &asset) == nil && strings.HasPrefix(asset.Type, "image/")
}
