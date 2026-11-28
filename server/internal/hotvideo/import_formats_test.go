package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"doubo/server/internal/store"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// movie is the head of an MP4 ("mp42") or an iPhone QuickTime ("qt  ") file.
func movie(brand string) []byte {
	payload := brand + "\x00\x00\x00\x00" + brand
	head := append(binary.BigEndian.AppendUint32(nil, uint32(8+len(payload))), "ftyp"+payload...)
	return append(append(head, binary.BigEndian.AppendUint32(nil, 72)...), append([]byte("mdat"), make([]byte, 64)...)...)
}

// An original upload that is not an MP4 (an iPhone .mov) gives way to
// Douyin's clean play copy; a 图文 post, or a post with no MP4 at all, says
// so instead of "生成结果类型无效".
func TestImportFallsBackFromAnOriginalThatIsNotMP4(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/douyin/app/v3/fetch_video_high_quality_play_url":
			_ = json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": map[string]any{"original_video_url": server.URL + "/original.mov"}})
		case "/original.mov", "/music.mov":
			_, _ = w.Write(movie("qt  "))
		case "/play.mp4":
			_, _ = w.Write(movie("mp42"))
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	ctx := context.Background()
	s := store.NewMemory()
	svc := &Service{Client: &Client{BaseURL: server.URL, Key: "k", HTTP: server.Client()}, Store: s}
	importer := Importer{Service: svc, Media: &media.Service{Store: s, Dir: t.TempDir(), HTTP: server.Client()}}
	now := time.Now().UTC()
	svc.keep(ctx, Video{ID: "7301", Title: "视频", URL: server.URL + "/play.mp4"}, now)
	svc.keep(ctx, Video{ID: "7302", Title: "图文", URL: server.URL + "/play.mp4", ImagePost: true}, now)
	svc.keep(ctx, Video{ID: "7303", Title: "无 MP4", URL: server.URL + "/music.mov"}, now)
	run := func(id string) (string, error) {
		return importer.Generate(ctx, core.NewJob("u", "import-"+id, core.JobInput{Kind: "import", Model: "hot-import", SourceID: id}))
	}
	result, err := run("7301")
	if err != nil || !strings.HasPrefix(result, "asset:") {
		t.Fatal(result, err)
	}
	row, _ := s.Get(ctx, "assets", strings.TrimPrefix(result, "asset:"))
	var asset media.Asset
	if json.Unmarshal(row.Data, &asset) != nil || asset.Type != "video/mp4" {
		t.Fatal("the play copy was not kept", string(row.Data))
	}
	if _, err := run("7302"); err == nil || !strings.Contains(err.Error(), "图文作品") {
		t.Fatal("a 图文 post:", err)
	}
	if _, err := run("7303"); err == nil || !strings.Contains(err.Error(), "没有可用的 MP4 视频") {
		t.Fatal("no MP4 anywhere:", err)
	}
}

func TestImagePostsAreRecognised(t *testing.T) {
	for _, c := range []struct {
		m    map[string]any
		want bool
	}{
		{map[string]any{"aweme_id": "1", "images": []any{map[string]any{"url_list": []any{"https://p/1.jpg"}}}}, true},
		{map[string]any{"aweme_id": "2", "aweme_type": json.Number("68")}, true},
		{map[string]any{"aweme_id": "3", "aweme_type": json.Number("0"), "images": nil}, false},
	} {
		if got := video(c.m).ImagePost; got != c.want {
			t.Fatal(c.m["aweme_id"], got)
		}
	}
}
