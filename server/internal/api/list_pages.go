package api

import (
	"doubo/server/internal/core"
	"net/http"
	"strconv"
)

func listQuery(w http.ResponseWriter, r *http.Request, ns string) (core.RecordQuery, bool) {
	q := core.RecordQuery{Namespace: ns, Page: 1, Size: 20, Search: r.URL.Query().Get("q"), Fields: map[string]string{}}
	for key, target := range map[string]*int{"page": &q.Page, "size": &q.Size} {
		if raw := r.URL.Query().Get(key); raw != "" {
			n, e := strconv.Atoi(raw)
			if e != nil {
				fail(w, 400, "分页参数无效")
				return q, false
			}
			*target = n
		}
	}
	if q.Page < 1 || q.Page > 1000000 || q.Size < 1 || q.Size > 100 || len([]rune(q.Search)) > 100 {
		fail(w, 400, "分页参数无效")
		return q, false
	}
	return q, true
}

func replyList(w http.ResponseWriter, r *http.Request, page core.RecordPage) {
	if r.URL.Query().Has("page") {
		reply(w, 200, page)
	} else {
		reply(w, 200, page.Items)
	}
}

func (a *Server) simpleList(ns string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q, ok := listQuery(w, r, ns)
		if !ok {
			return
		}
		page, e := a.Store.RecordPage(r.Context(), q)
		if e != nil {
			dbError(w, e)
			return
		}
		replyList(w, r, page)
	}
}
