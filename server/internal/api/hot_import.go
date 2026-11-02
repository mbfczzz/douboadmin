package api

import (
	"doubo/server/internal/core"
	"net/http"
)

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
	in := core.JobInput{Kind: "import", Model: "hot-import", Prompt: "导入抖音视频素材", SourceID: id}
	job := core.NewJob(identity(r).ID, key, in)
	job.ActivationRequired = a.Config.RequireActivation
	j, e := a.Store.CreateJob(r.Context(), job)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 202, j)
}
