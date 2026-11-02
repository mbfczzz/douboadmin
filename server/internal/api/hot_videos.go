package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"encoding/json"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

var videoID = regexp.MustCompile(`^[0-9]{1,32}$`)

func (a *Server) hotSearch(w http.ResponseWriter, r *http.Request) {
	if !a.Hot.Ready() {
		fail(w, 503, "抖音数据接口尚未配置，可以先上传自己的素材")
		return
	}
	q := r.URL.Query()
	keyword := strings.TrimSpace(q.Get("q"))
	order := q.Get("sort")
	cursor, _ := strconv.ParseInt(q.Get("cursor"), 10, 64)
	if keyword == "" || len([]rune(keyword)) > 60 || cursor < 0 || cursor > 1000000 || !slices.Contains([]string{"", "relevance", "likes", "recent", "views"}, order) || len(q.Get("searchId")) > 200 || len(q.Get("backtrace")) > 500 {
		fail(w, 400, "搜索条件无效")
		return
	}
	result, e := a.Hot.Search(r.Context(), hotvideo.Query{Keyword: keyword, Sort: order, Cursor: cursor, SearchID: q.Get("searchId"), Backtrace: q.Get("backtrace")})
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	user := identity(r).ID
	if cursor == 0 {
		_, _ = a.Store.Put(r.Context(), "search_history", core.Record{ID: core.NewID(), Owner: user, Data: core.Data(map[string]any{"keyword": keyword, "searchedAt": time.Now().UTC()})}, 0)
	}
	for _, item := range result.Items {
		old, _ := a.Store.Get(r.Context(), "hot_videos", item.ID)
		_, _ = a.Store.Put(r.Context(), "hot_videos", core.Record{ID: item.ID, Data: core.Data(item)}, old.Version)
	}
	reply(w, 200, result)
}
func (a *Server) hotDetail(w http.ResponseWriter, r *http.Request) {
	if !a.Hot.Ready() {
		fail(w, 503, "抖音数据接口尚未配置")
		return
	}
	id := r.PathValue("id")
	if !videoID.MatchString(id) {
		fail(w, 400, "视频标识无效")
		return
	}
	v, e := a.Hot.Client.Detail(r.Context(), id)
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	old, _ := a.Store.Get(r.Context(), "hot_videos", id)
	_, _ = a.Store.Put(r.Context(), "hot_videos", core.Record{ID: id, Data: core.Data(v)}, old.Version)
	reply(w, 200, v)
}
func (a *Server) hotDiscovery(w http.ResponseWriter, r *http.Request) {
	_, settings, e := a.platform(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	words := settings.HotKeywords
	source := "推荐关键词"
	if a.Hot.Ready() {
		if live, err := a.Hot.Hotwords(r.Context()); err == nil && len(live) > 0 {
			words = live
			source = "抖音热词"
		}
	}
	reply(w, 200, map[string]any{"enabled": a.Hot.Ready(), "keywords": words, "source": source, "globalViewSorting": false})
}
func (a *Server) searchHistory(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "search_history", identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	if r.Method == "DELETE" {
		for _, row := range rows {
			row.Data = core.Data(map[string]string{})
			_, _ = a.Store.Put(r.Context(), "search_history", row, row.Version)
		}
		reply(w, 200, map[string]bool{"ok": true})
		return
	}
	type entry struct {
		Keyword string    `json:"keyword"`
		Time    time.Time `json:"searchedAt"`
	}
	out := []entry{}
	for _, row := range rows {
		var v entry
		if json.Unmarshal(row.Data, &v) == nil && v.Keyword != "" {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Time.After(out[j].Time) })
	seen := map[string]bool{}
	unique := []entry{}
	for _, item := range out {
		if !seen[item.Keyword] {
			seen[item.Keyword] = true
			unique = append(unique, item)
		}
	}
	out = unique
	if len(out) > 20 {
		out = out[:20]
	}
	reply(w, 200, out)
}
