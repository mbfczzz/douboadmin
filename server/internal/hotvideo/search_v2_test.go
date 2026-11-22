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

const v2Video = `{"type":1,"aweme_info":{"aweme_id":7669082935156313379,"desc":"剧情带货","author":{"nickname":"作者"},"video":{"duration":5000,"cover":{"url_list":["https://cdn.example/cover.jpg"]},"play_addr":{"url_list":["https://cdn.example/video.mp4"]}},"statistics":{"digg_count":0,"comment_count":1}}}`

func TestSearchV2BusinessDataObjectsJSONTextPaginationAndCache(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var input map[string]any
		if json.NewDecoder(r.Body).Decode(&input) != nil || r.Method != "POST" || r.URL.Path != "/api/v1/douyin/search/fetch_video_search_v2" || r.Header.Get("Authorization") != "Bearer fixture" {
			t.Error("unexpected search request")
		}
		if calls == 2 && (input["cursor"] != float64(20) || input["search_id"] != "next-search" || input["backtrace"] != "next-backtrace") {
			t.Error("pagination identifiers were lost", input)
		}
		payload := map[string]any{"code": 200, "data": map[string]any{
			"status_code": 0,
			"business_data": []any{
				map[string]any{"type": 1, "data": json.RawMessage(v2Video)},
				map[string]any{"type": 1, "data": strings.Replace(v2Video, "7669082935156313379", "7669082935156313380", 1)},
				map[string]any{"type": 1, "data": v2Video},
				map[string]any{"type": 2, "data": "non-video card"},
			},
			"business_config": map[string]any{"cursor": 20, "has_more": true, "search_id": "next-search", "backtrace": "next-backtrace"},
		}}
		_ = json.NewEncoder(w).Encode(payload)
	}))
	defer server.Close()
	s := Service{Client: &Client{BaseURL: server.URL, Key: "fixture"}, Store: store.NewMemory()}
	q := Query{Keyword: "剧情带货"}
	result, err := s.Search(context.Background(), q)
	if err != nil || len(result.Items) != 2 {
		t.Fatal(result, err)
	}
	if result.Items[0].ID != "7669082935156313379" || result.Items[1].ID != "7669082935156313380" || result.Items[0].Cover == "" || result.Items[0].URL == "" || result.Items[0].Author != "作者" || result.Items[0].Duration != 5 {
		t.Fatal("V2 video fields or exact IDs lost", result.Items)
	}
	if result.Items[0].Likes == nil || *result.Items[0].Likes != 0 || result.Items[0].Views != nil || result.Cursor != 20 || !result.HasMore || result.SearchID != "next-search" || result.Backtrace != "next-backtrace" {
		t.Fatal(result)
	}
	if cached, e := s.Search(context.Background(), q); e != nil || !cached.Cached || calls != 1 {
		t.Fatal("V2 result not cached", calls, e)
	}
	q.Cursor, q.SearchID, q.Backtrace = result.Cursor, result.SearchID, result.Backtrace
	if _, e := s.Search(context.Background(), q); e != nil || calls != 2 {
		t.Fatal(calls, e)
	}
}

func TestSearchV2EmptyResultsRemainSuccessButFailuresAreNotCached(t *testing.T) {
	for _, body := range []string{
		`{"code":200,"data":{"status_code":0,"business_data":[],"cursor":0,"has_more":false}}`,
		`{"code":200,"data":{"status_code":9,"business_data":[]}}`,
		`{"code":200,"data":null}`,
		`{"code":200,"data":{"business_data":[{"type":1,"data":"invalid json"}]}}`,
	} {
		t.Run(body, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; _, _ = w.Write([]byte(body)) }))
			defer server.Close()
			s := Service{Client: &Client{BaseURL: server.URL, Key: "fixture"}, Store: store.NewMemory()}
			result, err := s.Search(context.Background(), Query{Keyword: "查询"})
			emptyOK := strings.Contains(body, `"status_code":0`)
			if emptyOK {
				if err != nil || result.Items == nil || len(result.Items) != 0 || result.HasMore {
					t.Fatal(result, err)
				}
			} else {
				if err == nil {
					t.Fatal("invalid upstream result treated as no videos")
				}
				_, _ = s.Search(context.Background(), Query{Keyword: "查询"})
				if calls != 2 {
					t.Fatal("failure cached", calls)
				}
			}
		})
	}
}

func TestSearchPaginationDoesNotReplaceExplicitZeroOrFalse(t *testing.T) {
	decoder := json.NewDecoder(strings.NewReader(`{"data":{"business_data":[],"cursor":0,"has_more":false,"search_id":"","log_pb":{"impr_id":"fallback-search"},"business_config":{"cursor":40,"has_more":true}}}`))
	decoder.UseNumber()
	var root map[string]any
	if err := decoder.Decode(&root); err != nil {
		t.Fatal(err)
	}
	result, err := normalizeSearch(root)
	if err != nil || result.Cursor != 0 || result.HasMore || result.SearchID != "fallback-search" {
		t.Fatal(result, err)
	}
}
