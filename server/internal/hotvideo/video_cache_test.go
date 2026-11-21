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
// resolved once in that window; importers use the same full detail cache.
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
	// Importing through Service.Video reuses the playable detail. The importer
	// separately asks for the original upload URL and falls back to this URL.
	_, _ = s.Video(ctx, "7301")
	if detail.Load() != 2 {
		t.Fatal("import repeated the detail request", detail.Load())
	}
	// Defaults when nothing is configured.
	d := (&Service{}).CacheTTLs()
	if d != (CacheTTL{Feed: 24 * time.Hour, Search: 5 * time.Minute, Words: 10 * time.Minute, Video: 30 * time.Minute}) {
		t.Fatal(d)
	}
}

// A hot-list item (no play address) never stands in for a full detail.
func TestHotListItemsDoNotReplaceDetails(t *testing.T) {
	var detail atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		detail.Add(1)
		_, _ = w.Write([]byte(`{"code":200,"data":{"aweme_detail":{"aweme_id":"7301","desc":"文案","video":{"play_addr":{"url_list":["https://cdn.example/play/1.mp4"]}}}}}`))
	}))
	defer server.Close()
	ctx := t.Context()
	s := &Service{Client: &Client{BaseURL: server.URL, Key: "k"}, Store: store.NewMemory(), TTL: CacheTTL{Video: 10 * time.Minute}}
	_, _ = s.Video(ctx, "7301")                                    // a full detail, cached
	s.Remember(ctx, []Video{{ID: "7301", Text: "榜单"}}, time.Now()) // a hot-list item without a play address
	if v, _ := s.Video(ctx, "7301"); v.URL == "" || detail.Load() != 1 {
		t.Fatal("the hot-list item replaced the detail", v.URL, detail.Load())
	}
	// And a cached copy without a play address is read live.
	s.Store = store.NewMemory()
	_, _ = s.Store.Put(ctx, "hot_videos", core.Record{ID: "7301", Data: core.Data(cachedVideo{Video{ID: "7301"}, time.Now()})}, 0)
	if v, err := s.Video(ctx, "7301"); err != nil || v.URL == "" || detail.Load() != 2 {
		t.Fatal("served without a player", v.URL, err)
	}
}
