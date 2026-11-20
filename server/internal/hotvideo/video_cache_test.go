package hotvideo

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// A video read for display is reused for CacheTTL.Video; a pasted link is
// resolved once in that window; the import path stays live.
func TestVideoAndLinkCacheFollowTheConfiguredWindow(t *testing.T) {
	var detail, share atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/douyin/app/v3/fetch_one_video":
			detail.Add(1)
			_, _ = w.Write([]byte(`{"code":200,"data":{"aweme_detail":{"aweme_id":"7301","desc":"文案","video":{"play_addr":{"url_list":["https://cdn.example/play/1.mp4"]}}}}}`))
		case "/api/v1/douyin/app/v3/fetch_one_video_by_share_url":
			share.Add(1)
			_, _ = w.Write([]byte(`{"code":200,"data":{"aweme_detail":{"aweme_id":"7301","desc":"文案","video":{"play_addr":{"url_list":["https://cdn.example/play/1.mp4"]}}}}}`))
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	ctx := t.Context()
	s := &Service{Client: &Client{BaseURL: server.URL, Key: "k"}, Store: store.NewMemory(), TTL: CacheTTL{Video: 10 * time.Minute}}
	for range 3 {
		if v, err := s.Video(ctx, "7301"); err != nil || v.Text != "文案" {
			t.Fatal(v, err)
		}
	}
	if detail.Load() != 1 {
		t.Fatal("detail calls", detail.Load())
	}
	for range 2 {
		if v, err := s.VideoByLink(ctx, " https://v.douyin.com/abc/ "); err != nil || v.ID != "7301" {
			t.Fatal(v, err)
		}
	}
	if share.Load() != 1 || detail.Load() != 1 {
		t.Fatal("a repeated link went to TikHub", share.Load(), detail.Load())
	}
	// Past the window the next read is live again.
	row, _ := s.Store.Get(ctx, "hot_videos", "7301")
	var c cachedVideo
	_ = json.Unmarshal(row.Data, &c)
	c.CachedAt = time.Now().Add(-11 * time.Minute)
	_, _ = s.Store.Put(ctx, "hot_videos", core.Record{ID: "7301", Data: core.Data(c)}, row.Version)
	_, _ = s.Video(ctx, "7301")
	if detail.Load() != 2 {
		t.Fatal("stale copy served", detail.Load())
	}
	// Importing (Client.Detail) never reads the cache.
	_, _ = s.Client.Detail(ctx, "7301")
	if detail.Load() != 3 {
		t.Fatal("import must read live")
	}
	// Defaults when nothing is configured.
	d := (&Service{}).CacheTTLs()
	if d != (CacheTTL{Feed: time.Hour, Search: 5 * time.Minute, Words: 10 * time.Minute, Video: 30 * time.Minute}) {
		t.Fatal(d)
	}
}
