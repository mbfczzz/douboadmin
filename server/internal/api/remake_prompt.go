package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/vision"
	"errors"
	"net/http"
	"strings"
)

// remakeBrief writes 生成同款's description on the server (hotvideo
// RemakePrompt) from the user's prepared remake task and its breakdown, so
// the wording can change without a mini-program release.
func (a *Server) remakeBrief(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Job     string          `json:"job"`
		Seconds int             `json:"seconds"`
		Limit   int             `json:"limit"`
		Images  int             `json:"images"`
		Swaps   []hotvideo.Swap `json:"swaps"`
		// The pictures' asset ids in @图片 order (newer pages), read for
		// each swap's look.
		Pictures []string `json:"pictures"`
	}
	if !decode(w, r, &v) {
		return
	}
	if v.Seconds < 1 || v.Seconds > 60 || v.Limit < 50 || v.Limit > core.MaxPlanPromptChars || v.Images < 0 || v.Images > 9 || len(v.Swaps) > 5 || len(v.Pictures) > 9 {
		fail(w, 400, "复刻参数无效")
		return
	}
	for _, s := range v.Swaps {
		if s.Picture < 1 || s.Picture > v.Images || s.Name == "" || len([]rune(s.Name)) > 20 {
			fail(w, 400, "替换设置无效")
			return
		}
	}
	j, err := a.Store.Job(r.Context(), v.Job)
	if err != nil && !errors.Is(err, core.ErrNotFound) {
		dbError(w, err)
		return
	}
	if err != nil || j.UserID != identity(r).ID || j.Input.Purpose != hotvideo.RemakePurpose || j.Status != "succeeded" {
		fail(w, 404, "复刻任务不存在")
		return
	}
	var breakdown *vision.Breakdown
	if a.Vision.Ready() && j.Input.SourceID != "" {
		if rec, e := a.Hot.SavedBreakdown(r.Context(), a.Vision.ModelID(), j.Input.SourceID); e == nil && rec.Status == "done" {
			breakdown = rec.Result
		}
	}
	if hotvideo.Unknown(breakdown, v.Swaps) {
		fail(w, 409, "原视频的拆解已更新，请重新选择要替换的人物或商品")
		return
	}
	a.swapLooks(r.Context(), identity(r).ID, breakdown, v.Pictures, v.Swaps)
	title, text, _ := strings.Cut(j.Input.Prompt, "\n")
	original := hotvideo.Original{Title: strings.TrimPrefix(title, "一键复刻："), Text: text, Duration: float64(j.Input.Duration)}
	prompt := hotvideo.RemakePrompt(breakdown, original, v.Seconds, v.Limit, v.Images, v.Swaps)
	width, height := a.remakeShape(r.Context(), j.Result)
	reply(w, 200, map[string]any{"prompt": prompt, "width": width, "height": height})
}
