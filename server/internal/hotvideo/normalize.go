package hotvideo

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func object(v any) map[string]any { m, _ := v.(map[string]any); return m }
func str(v any) string {
	switch n := v.(type) {
	case string:
		return n
	case json.Number:
		return n.String()
	}
	return ""
}
func integer(v any) *int64 {
	s := str(v)
	n, e := strconv.ParseInt(s, 10, 64)
	if e != nil || n < 0 {
		return nil
	}
	return &n
}
func unwrap(m map[string]any) map[string]any {
	for range 4 {
		next := object(m["data"])
		if next == nil {
			break
		}
		m = next
	}
	return m
}
func number(v any) int64 {
	n := integer(v)
	if n == nil {
		return 0
	}
	return *n
}
func urls(v any) string {
	m := object(v)
	list, _ := m["url_list"].([]any)
	for _, raw := range list {
		s := str(raw)
		u, e := url.Parse(s)
		// "playwm" is the watermarked copy; play and download_addr keep the clean one first.
		if e == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && !strings.Contains(u.Path, "playwm") {
			return s
		}
	}
	return ""
}
func video(m map[string]any) Video {
	id := str(m["aweme_id"])
	media := object(m["video"])
	stats := object(m["statistics"])
	author := object(m["author"])
	text := str(m["desc"])
	runes := []rune(strings.TrimSpace(text))
	if len(runes) > 50 {
		runes = runes[:50]
	}
	cover := urls(media["cover"])
	if cover == "" {
		cover = urls(media["origin_cover"])
	}
	play := urls(media["play_addr"])
	if play == "" {
		play = urls(media["download_addr"])
	}
	images, _ := m["images"].([]any)
	return Video{ID: id, Title: string(runes), Text: text, Author: str(author["nickname"]), Cover: cover, URL: play, SourceURL: "https://www.douyin.com/video/" + id, Likes: integer(stats["digg_count"]), Views: integer(stats["play_count"]), Comments: integer(stats["comment_count"]), PublishedAt: time.Unix(number(m["create_time"]), 0).UTC(), Duration: float64(number(media["duration"])) / 1000,
		ImagePost: len(images) > 0 || number(m["aweme_type"]) == imagePostType}
}

// imagePostType is Douyin's aweme_type of a 图文 post (its "images" list is
// the other sign).
const imagePostType = 68

func normalizeSearch(root map[string]any) (Result, error) {
	rows, data := searchRows(root)
	if code := integer(data["status_code"]); code != nil && *code != 0 {
		return Result{}, fmt.Errorf("抖音上游暂未返回有效搜索结果，请稍后重试")
	}
	if rows == nil {
		return Result{}, fmt.Errorf("抖音接口未返回可识别的视频列表")
	}
	meta := searchMetadata(data)
	result := Result{Items: []Video{}, Cursor: number(meta["cursor"]), HasMore: number(meta["has_more"]) > 0, SearchID: str(meta["search_id"]), Backtrace: str(meta["backtrace"]), SortScope: "upstream", FetchedAt: time.Now().UTC()}
	if has, ok := meta["has_more"].(bool); ok {
		result.HasMore = has
	}
	if result.SearchID == "" {
		result.SearchID = str(object(meta["log_pb"])["impr_id"])
	}
	seen := map[string]bool{}
	for _, row := range rows {
		item, valid := searchVideo(row)
		if !valid {
			return Result{}, fmt.Errorf("抖音搜索返回的视频条目格式无效，请稍后重试")
		}
		v := video(item)
		if v.ID != "" && !seen[v.ID] {
			result.Items = append(result.Items, v)
			seen[v.ID] = true
		}
	}
	return result, nil
}
