package api

import (
	"doubo/server/internal/core"
	"net/http"
	"strconv"
)

func jobQuery(w http.ResponseWriter, r *http.Request) (core.JobQuery, bool) {
	v := r.URL.Query()
	q := core.JobQuery{Page: 1, Size: 20, Search: v.Get("q"), Status: v.Get("status"), Kind: v.Get("kind"), Deleted: v.Get("deleted"), Works: v.Get("works") == "true", ExcludeChat: v.Get("excludeChat") == "true", Ended: v.Get("ended") == "true"}
	if v.Has("page") {
		q.Page, _ = strconv.Atoi(v.Get("page"))
	}
	if v.Has("size") {
		q.Size, _ = strconv.Atoi(v.Get("size"))
	}
	if !q.Valid() {
		fail(w, 400, "分页参数无效")
		return q, false
	}
	return q, true
}

func (a *Server) pagedJobs(w http.ResponseWriter, r *http.Request, works bool) {
	q, ok := jobQuery(w, r)
	if !ok {
		return
	}
	if identity(r).Role != "admin" {
		q.User = identity(r).ID
		if works || q.Works {
			q.Deleted = "active"
		}
	}
	q.Works = q.Works || works
	out, e := a.Store.JobPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	for i := range out.Items {
		a.presentJob(r.Context(), &out.Items[i])
	}
	reply(w, 200, out)
}
