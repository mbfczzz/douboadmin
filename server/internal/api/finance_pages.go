package api

import (
	"doubo/server/internal/core"
	"net/http"
	"strconv"
	"strings"
)

// Legacy callers receive the first page as an array; current clients request
// page explicitly and use the total and page size returned by the database.
func financeQuery(w http.ResponseWriter, r *http.Request, namespace, owner string) (core.RecordQuery, bool) {
	v := r.URL.Query()
	q := core.RecordQuery{Namespace: namespace, Owner: owner, Page: 1, Size: 20, Search: strings.TrimSpace(v.Get("q")), Status: v.Get("status")}
	// Public lists do not expose free-text filtering over private payment or
	// ledger fields. Only administrators have the corresponding search UI.
	if identity(r).Role != "admin" && q.Search != "" {
		fail(w, 400, "此列表不支持文本搜索")
		return q, false
	}
	for key, target := range map[string]*int{"page": &q.Page, "size": &q.Size} {
		if v.Has(key) {
			n, e := strconv.Atoi(v.Get(key))
			if e != nil {
				fail(w, 400, "分页参数无效")
				return q, false
			}
			*target = n
		}
	}
	if q.Page < 1 || q.Page > 1000000 || q.Size < 1 || q.Size > 100 || len([]rune(q.Search)) > 100 || len(q.Status) > 30 {
		fail(w, 400, "分页或筛选参数无效")
		return q, false
	}
	return q, true
}

func financeReply(w http.ResponseWriter, r *http.Request, page core.RecordPage) {
	if r.URL.Query().Has("page") {
		reply(w, 200, page)
	} else {
		reply(w, 200, page.Items)
	}
}
