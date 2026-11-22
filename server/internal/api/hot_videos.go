package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
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
		fail(w, 503, "抖音视频功能暂未开放，可以先上传自己的素材")
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
	feed := q.Get("history") == "0"
	result, e := a.Hot.Search(r.Context(), hotvideo.Query{Keyword: keyword, Sort: order, Cursor: cursor, SearchID: q.Get("searchId"), Backtrace: q.Get("backtrace"), Feed: feed})
	if e != nil {
		hotFail(w, r, e)
		return
	}
	user := identity(r).ID
	// history=0: the 创作 page's video feed browses keywords, it is not the user's own search.
	if cursor == 0 && !feed {
		_, _ = a.Store.Put(r.Context(), "search_history", core.Record{ID: core.NewID(), Owner: user, Data: core.Data(map[string]any{"keyword": keyword, "searchedAt": time.Now().UTC()})}, 0)
	}
	if !result.Cached { // a page served from cache was remembered when fetched
		a.Hot.Remember(r.Context(), result.Items, result.FetchedAt)
	}
	reply(w, 200, result)
}
func (a *Server) hotDetail(w http.ResponseWriter, r *http.Request) {
	if !a.Hot.Ready() {
		fail(w, 503, "抖音视频功能暂未开放")
		return
	}
	id := r.PathValue("id")
	if !videoID.MatchString(id) {
		fail(w, 400, "视频标识无效")
		return
	}
	v, e := a.Hot.Video(r.Context(), id)
	if e != nil {
		hotFail(w, r, e)
		return
	}
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
	// words=0 is the 创作 feed: its fixed keywords (kept fresh in Redis), no
	// TikHub call here.
	if r.URL.Query().Get("words") == "0" {
		words, source = a.Hot.FeedWords(), "创作关键词"
	} else if a.Hot.Ready() && !browseOnly(r) {
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

// 文案提取 / 一键复刻: the video behind a pasted Douyin share link.
func (a *Server) hotLink(w http.ResponseWriter, r *http.Request) {
	if !a.Hot.Ready() {
		fail(w, 503, "抖音视频功能暂未开放")
		return
	}
	var v struct {
		Text string `json:"text"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&v) != nil || strings.TrimSpace(v.Text) == "" {
		fail(w, 400, "请粘贴抖音视频的分享链接")
		return
	}
	id, link, e := hotvideo.ParseLink(v.Text)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	var video hotvideo.Video
	if id != "" {
		video, e = a.Hot.Video(r.Context(), id)
	} else {
		video, e = a.Hot.VideoByLink(r.Context(), link)
	}
	if e != nil {
		hotFail(w, r, e)
		return
	}
	reply(w, 200, video)
}

// hotFail answers a Douyin data failure and logs it, so the reason shows in
// the service log and in 运行监控 → 错误日志 (WARN entries are kept there).
// Users see only reasons they can act on (hotvideo.UserError); the data
// provider's own words (keys, balance, HTTP status) stay in the log.
func hotFail(w http.ResponseWriter, r *http.Request, e error) {
	slog.Warn("hot video request failed", "path", r.URL.Path, "error", e.Error())
	var mine hotvideo.UserError
	if errors.As(e, &mine) {
		fail(w, 502, mine.Error())
		return
	}
	fail(w, 502, "抖音视频暂时读取不到，请稍后重试")
}
