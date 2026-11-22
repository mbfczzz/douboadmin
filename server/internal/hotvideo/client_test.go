package hotvideo

import (
	"context"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSearchContractCacheAndMissingMetrics(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/api/v1/douyin/search/fetch_video_search_v2" || r.Header.Get("Authorization") != "Bearer fixture" {
			t.Error("wrong provider request")
		}
		var in map[string]any
		_ = json.NewDecoder(r.Body).Decode(&in)
		if in["sort_type"] != "1" || in["keyword"] != "产品" {
			t.Error(in)
		}
		_, _ = w.Write([]byte(`{"code":200,"data":{"data":[{"aweme_info":{"aweme_id":"7669082935156313379","desc":"真实文案","author":{"nickname":"作者"},"video":{"duration":5000,"cover":{"url_list":["https://cdn.example/c.jpg"]},"play_addr":{"url_list":["https://cdn.example/v.mp4"]}},"statistics":{"digg_count":0}}}],"cursor":20,"has_more":1,"search_id":"search-id"}}`))
	}))
	defer server.Close()
	s := Service{Client: &Client{BaseURL: server.URL, Key: "fixture"}, Store: store.NewMemory()}
	query := Query{Keyword: "产品", Sort: "likes"}
	result, e := s.Search(context.Background(), query)
	if e != nil {
		t.Fatal(e)
	}
	if result.Items[0].ID != "7669082935156313379" || result.Items[0].Likes == nil || *result.Items[0].Likes != 0 || result.Items[0].Views != nil || result.Cursor != 20 || !result.HasMore {
		t.Fatal(result)
	}
	result, e = s.Search(context.Background(), query)
	if e != nil || !result.Cached || calls != 1 {
		t.Fatal("cache not used", calls, e)
	}
}

// TikHub search v2's current shape: business_data[].data.aweme_info.
func TestSearchBusinessDataShape(t *testing.T) {
	root := map[string]any{}
	body := `{"code":200,"data":{"business_data":[{"data_id":"0","type":1,"data":{"type":1,"aweme_info":{"aweme_id":"7301","desc":"剧情带货","author":{"nickname":"作者"},"video":{"cover":{"url_list":["https://cdn.example/c.jpg"]},"play_addr":{"url_list":["https://cdn.example/v.mp4"]}},"statistics":{"digg_count":12}}}},{"data_id":"1","type":999,"data":{"type":999}}],"cursor":10,"has_more":1,"extra":{}}}`
	decoder := json.NewDecoder(strings.NewReader(body))
	decoder.UseNumber() // as Client.request reads replies
	if err := decoder.Decode(&root); err != nil {
		t.Fatal(err)
	}
	if rows, _ := searchRows(root); len(rows) != 2 {
		t.Fatal("business_data not found")
	}
	r, err := normalizeSearch(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Items) != 1 || r.Items[0].ID != "7301" || r.Items[0].Author != "作者" || r.Cursor != 10 || !r.HasMore {
		t.Fatalf("%+v", r)
	}
}
