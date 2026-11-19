package hotvideo

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"
)

// The 创作 feed reads Douyin's video hot list (抖音热点宝 视频榜 via TikHub):
// last 7 days, the overall list, filtered by the chip's keyword ("热门" = the
// whole list). Keyword search stays available (HOT_FEED_SOURCE=search).
// TikHub does not document the reply, so the parser accepts the usual field
// names and logs the head of a reply it cannot read.
const (
	billboardPath   = "/api/v1/douyin/billboard/fetch_hot_total_video_list"
	billboardWindow = 168  // hours: 1 / 24 / 72 / 168
	billboardType   = 1001 // 1001 总榜, 1002 低粉爆款, 1003 高完播率, 1004 高涨粉率, 1005 高点赞率
	billboardSize   = 20
	// AllKeyword is the chip that shows the whole list.
	AllKeyword = "热门"
)

func (c *Client) Billboard(ctx context.Context, q Query) (Result, error) {
	page := q.Cursor // the mini-program passes back the cursor we return
	if page < 1 {
		page = 1
	}
	keyword := q.Keyword
	if keyword == AllKeyword {
		keyword = ""
	}
	root, err := c.request(ctx, "POST", billboardPath, map[string]any{"page": page, "page_size": billboardSize, "date_window": billboardWindow, "sub_type": billboardType, "keyword": keyword, "tags": []any{}})
	if err != nil {
		return Result{}, err
	}
	rows := billboardRows(root)
	if rows == nil {
		raw, _ := json.Marshal(root)
		head := string(raw)
		if len(head) > 600 {
			head = head[:600]
		}
		slog.Warn("tikhub billboard reply not understood", "head", head)
		return Result{}, fmt.Errorf("抖音视频榜未返回可识别的列表")
	}
	result := Result{Items: []Video{}, SortScope: "upstream", FetchedAt: time.Now().UTC()}
	seen := map[string]bool{}
	for _, row := range rows {
		if v := billboardVideo(object(row)); v.ID != "" && !seen[v.ID] {
			result.Items = append(result.Items, v)
			seen[v.ID] = true
		}
	}
	result.HasMore = len(rows) >= billboardSize && page < 10
	result.Cursor = page + 1
	return result, nil
}

// billboardRows finds the first list of objects that look like videos.
func billboardRows(v any) []any {
	switch x := v.(type) {
	case map[string]any:
		for _, key := range []string{"objs", "list", "items", "video_list", "data"} {
			if rows := billboardRows(x[key]); rows != nil {
				return rows
			}
		}
	case []any:
		if len(x) == 0 {
			return x
		}
		if first := object(x[0]); first != nil && (field(first, "item_id", "aweme_id", "itemId", "id") != "" || object(first["aweme_info"]) != nil) {
			return x
		}
	}
	return nil
}

func field(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if s := str(m[k]); s != "" {
			return s
		}
	}
	return ""
}

func count(m map[string]any, keys ...string) *int64 {
	for _, k := range keys {
		if n := integer(m[k]); n != nil {
			return n
		}
	}
	return nil
}

func billboardVideo(m map[string]any) Video {
	if m == nil {
		return Video{}
	}
	if info := object(m["aweme_info"]); info != nil { // some lists wrap the full aweme
		return video(info)
	}
	id := field(m, "item_id", "aweme_id", "itemId", "id")
	text := field(m, "item_title", "title", "desc", "itemTitle")
	title := []rune(strings.TrimSpace(text))
	if len(title) > 50 {
		title = title[:50]
	}
	cover := field(m, "item_cover_url", "cover_url", "cover", "itemCover")
	if u, e := url.Parse(cover); e != nil || u.Hostname() == "" || u.User != nil {
		cover = ""
	} else if u.Scheme == "http" {
		u.Scheme = "https" // mini-program images must be HTTPS
		cover = u.String()
	}
	published := number(m["publish_time"])
	if published == 0 {
		published = number(m["create_time"])
	}
	return Video{ID: id, Title: string(title), Text: text, Author: field(m, "nick_name", "nickname", "author_name", "author"), Cover: cover,
		SourceURL: "https://www.douyin.com/video/" + id, Likes: count(m, "like_cnt", "digg_count", "like_count"),
		Views: count(m, "play_cnt", "play_count", "view_count"), Comments: count(m, "comment_cnt", "comment_count"),
		PublishedAt: time.Unix(published, 0).UTC(), Duration: float64(number(m["item_duration"]))}
}
