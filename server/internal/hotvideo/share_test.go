package hotvideo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The app share endpoint coming back empty falls through to the web one, and
// the original upload replaces the watermarked play address.
func TestShareVideoFallbackAndOriginal(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path+"?"+r.URL.RawQuery)
		switch r.URL.Path {
		case "/api/v1/douyin/app/v3/fetch_one_video_by_share_url":
			_, _ = w.Write([]byte(`{"code":200,"data":{"filter_list":[{"reason":8}]}}`))
		case "/api/v1/douyin/web/fetch_one_video_by_share_url":
			_, _ = w.Write([]byte(`{"code":200,"data":{"aweme_detail":{"aweme_id":"7301","desc":"真实文案","video":{"play_addr":{"url_list":["https://cdn.example/playwm/1.mp4","https://cdn.example/play/1.mp4"]}}}}}`))
		case "/api/v1/douyin/app/v3/fetch_video_high_quality_play_url":
			_, _ = w.Write([]byte(`{"code":200,"data":{"video_id":"7301","original_video_url":"https://cdn.example/original.mp4"}}`))
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	c := &Client{BaseURL: server.URL, Key: "fixture"}
	v, err := c.ShareVideo(context.Background(), "https://v.douyin.com/abc/")
	if err != nil || v.ID != "7301" || v.Text != "真实文案" || v.URL != "https://cdn.example/play/1.mp4" {
		t.Fatalf("got %+v %v", v, err)
	}
	if paths[0] != "/api/v1/douyin/app/v3/fetch_one_video_by_share_url?share_url=https%3A%2F%2Fv.douyin.com%2Fabc%2F" {
		t.Fatal(paths)
	}
	original, err := c.OriginalURL(context.Background(), "7301")
	if err != nil || original != "https://cdn.example/original.mp4" || paths[2] != "/api/v1/douyin/app/v3/fetch_video_high_quality_play_url?aweme_id=7301&region=CN" {
		t.Fatalf("got %q %v %v", original, err, paths)
	}
}
