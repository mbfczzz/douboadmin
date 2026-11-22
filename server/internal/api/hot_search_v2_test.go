package api

import (
	"doubo/server/internal/hotvideo"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHotFeedAcceptsV2BusinessDataWithoutAddingUserSearchHistory(t *testing.T) {
	a, user, _ := setup(t)
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(`{"code":200,"data":{"status_code":0,"business_data":[{"type":1,"data":"{\"aweme_info\":{\"aweme_id\":\"7669082935156313379\",\"desc\":\"剧情带货\"}}"}],"cursor":20,"has_more":true,"search_id":"next"}}`))
	}))
	defer upstream.Close()
	a.Hot = &hotvideo.Service{Client: &hotvideo.Client{BaseURL: upstream.URL, Key: "fixture"}, Store: a.Store}
	path := "/api/hot/videos?q=%E5%89%A7%E6%83%85%E5%B8%A6%E8%B4%A7&cursor=0&searchId=&backtrace=&history=0"
	for i := 0; i < 2; i++ {
		w := call(a, "GET", path, user, "", nil)
		var result hotvideo.Result
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || len(result.Items) != 1 || result.Cursor != 20 || !result.HasMore {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if calls != 1 {
		t.Fatal("feed search repeated upstream request", calls)
	}
	rows, err := a.Store.List(t.Context(), "search_history", "user-a")
	if err != nil || len(rows) != 0 {
		t.Fatal("feed browsing wrote user history", err)
	}
}
