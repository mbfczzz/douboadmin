package hotvideo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type Video struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Text        string    `json:"text"`
	Author      string    `json:"author"`
	Cover       string    `json:"cover"`
	URL         string    `json:"url"`
	SourceURL   string    `json:"sourceUrl"`
	Likes       *int64    `json:"likes"`
	Views       *int64    `json:"views"`
	Comments    *int64    `json:"comments"`
	PublishedAt time.Time `json:"publishedAt"`
	Duration    float64   `json:"duration"`
}
type Query struct {
	Keyword, Sort, SearchID, Backtrace string
	Cursor                             int64
}
type Result struct {
	Items     []Video   `json:"items"`
	Cursor    int64     `json:"cursor"`
	HasMore   bool      `json:"hasMore"`
	SearchID  string    `json:"searchId"`
	Backtrace string    `json:"backtrace"`
	SortScope string    `json:"sortScope"`
	Cached    bool      `json:"cached"`
	FetchedAt time.Time `json:"fetchedAt"`
}
type Client struct {
	BaseURL, Key string
	HTTP         *http.Client
}

func (c *Client) Ready() bool { return c != nil && c.Key != "" && c.BaseURL != "" }
func (c *Client) request(ctx context.Context, method, path string, body any) (map[string]any, error) {
	if !c.Ready() {
		return nil, fmt.Errorf("抖音数据接口尚未配置")
	}
	var raw []byte
	var err error
	if body != nil {
		raw, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
	}
	r, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("数据接口地址无效")
	}
	r.Header.Set("Authorization", "Bearer "+c.Key)
	r.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 40 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := client.Do(r)
	if err != nil {
		return nil, fmt.Errorf("抖音数据服务连接失败")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, fmt.Errorf("抖音数据服务返回 HTTP %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (8<<20)+1))
	if err != nil || len(data) > 8<<20 {
		return nil, fmt.Errorf("抖音数据响应不完整")
	}
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if decoder.Decode(&payload) != nil {
		return nil, fmt.Errorf("抖音数据格式无效")
	}
	if code := integer(payload["code"]); code != nil && *code != 0 && *code != 200 {
		return nil, fmt.Errorf("抖音数据服务暂未返回有效结果")
	}
	return payload, nil
}
func (c *Client) Search(ctx context.Context, q Query) (Result, error) {
	order := "0"
	if q.Sort == "likes" {
		order = "1"
	}
	if q.Sort == "recent" {
		order = "2"
	}
	root, err := c.request(ctx, "POST", "/api/v1/douyin/search/fetch_video_search_v2", map[string]any{"keyword": q.Keyword, "cursor": q.Cursor, "sort_type": order, "publish_time": "0", "filter_duration": "0", "content_type": "1", "search_id": q.SearchID, "backtrace": q.Backtrace})
	if err != nil {
		return Result{}, err
	}
	data := unwrap(root)
	_, list := data["data"].([]any)
	_, awemes := data["aweme_list"].([]any)
	if !list && !awemes {
		return Result{}, fmt.Errorf("抖音接口未返回可识别的视频列表")
	}
	result := normalizeSearch(root)
	if q.Sort == "views" {
		result.SortScope = "page"
		sort.SliceStable(result.Items, func(i, j int) bool {
			x, y := result.Items[i].Views, result.Items[j].Views
			if x == nil {
				return false
			}
			return y == nil || *x > *y
		})
	}
	return result, nil
}
func (c *Client) Detail(ctx context.Context, id string) (Video, error) {
	root, err := c.request(ctx, "GET", "/api/v1/douyin/app/v3/fetch_one_video?aweme_id="+url.QueryEscape(id), nil)
	if err != nil {
		return Video{}, err
	}
	data := unwrap(root)
	item := object(data["aweme_detail"])
	if item == nil {
		item = data
	}
	v := video(item)
	if v.ID != id {
		return Video{}, fmt.Errorf("未找到指定视频")
	}
	return v, nil
}
func (c *Client) Hotwords(ctx context.Context) ([]string, error) {
	root, err := c.request(ctx, "GET", "/api/v1/douyin/app/v3/fetch_hot_search_list", nil)
	if err != nil {
		return nil, err
	}
	data := unwrap(root)
	list, _ := data["word_list"].([]any)
	if list == nil {
		if nested := object(data["data"]); nested != nil {
			list, _ = nested["word_list"].([]any)
		}
	}
	out := []string{}
	for _, row := range list {
		word := str(object(row)["word"])
		if word != "" {
			out = append(out, word)
		}
		if len(out) == 12 {
			break
		}
	}
	return out, nil
}
