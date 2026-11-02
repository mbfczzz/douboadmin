package hotvideo

import (
	"encoding/json"
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
		if e == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil {
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
	return Video{ID: id, Title: string(runes), Text: text, Author: str(author["nickname"]), Cover: cover, URL: play, SourceURL: "https://www.douyin.com/video/" + id, Likes: integer(stats["digg_count"]), Views: integer(stats["play_count"]), Comments: integer(stats["comment_count"]), PublishedAt: time.Unix(number(m["create_time"]), 0).UTC(), Duration: float64(number(media["duration"])) / 1000}
}
func normalizeSearch(root map[string]any) Result {
	data := unwrap(root)
	rows, _ := data["data"].([]any)
	if rows == nil {
		rows, _ = data["aweme_list"].([]any)
	}
	result := Result{Items: []Video{}, Cursor: number(data["cursor"]), HasMore: number(data["has_more"]) > 0, SearchID: str(data["search_id"]), Backtrace: str(data["backtrace"]), SortScope: "upstream", FetchedAt: time.Now().UTC()}
	if has, ok := data["has_more"].(bool); ok {
		result.HasMore = has
	}
	if result.SearchID == "" {
		result.SearchID = str(object(data["log_pb"])["impr_id"])
	}
	seen := map[string]bool{}
	for _, row := range rows {
		item := object(row)
		if nested := object(item["aweme_info"]); nested != nil {
			item = nested
		}
		v := video(item)
		if v.ID != "" && !seen[v.ID] {
			result.Items = append(result.Items, v)
			seen[v.ID] = true
		}
	}
	return result
}
