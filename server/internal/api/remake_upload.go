package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"net/http"
	"regexp"
)

// remakeUpload prepares a 一键复刻 from a video the user uploaded instead of
// a Douyin one: the same task (import, purpose remake) with the source
// "u<asset id>", so the preparation skips the download and breaks the
// user's own file down. Breakdowns of uploads are readable by their owner only.
func (a *Server) remakeUpload(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("Idempotency-Key")
	if len(key) < 8 || len(key) > 128 {
		fail(w, 400, "请提供复刻请求标识")
		return
	}
	var v struct {
		Video    string   `json:"video"`
		Assets   []string `json:"assets"`
		Title    string   `json:"title"`
		Duration int      `json:"duration"`
	}
	if !decode(w, r, &v) {
		return
	}
	user := identity(r).ID
	if _, problem := a.breakdownAsset(r.Context(), v.Video, user); problem != "" {
		fail(w, 400, problem)
		return
	}
	if len(v.Assets) > 3 || v.Duration < 0 || v.Duration > 3600 {
		fail(w, 400, "复刻参数无效")
		return
	}
	for _, asset := range v.Assets {
		if !a.ownImage(r.Context(), asset, user) {
			fail(w, 400, "替换用的图片不可用")
			return
		}
	}
	title := v.Title
	if title == "" {
		title = "我上传的视频"
	}
	in := core.JobInput{Kind: "import", Model: "hot-import", Purpose: hotvideo.RemakePurpose, SourceID: hotvideo.UploadSource(v.Video),
		Assets: v.Assets, Duration: v.Duration, Prompt: remakePrompt(title, "")}
	job := core.NewJob(user, key, in)
	job.ActivationRequired = a.Config.RequireActivation
	j, e := a.Store.CreateJob(r.Context(), job)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 202, j)
}

// uploadID is a breakdown source for an uploaded video ("u" + asset id).
var uploadID = regexp.MustCompile(`^u[0-9a-f]{32}$`)
