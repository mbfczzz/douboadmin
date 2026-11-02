package hotvideo

import (
	"context"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
