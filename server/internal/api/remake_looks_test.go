package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/media"
	"doubo/server/internal/vision"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// 生成同款 says who the new person is: each swapped picture is described by
// the vision model (a person's face and hair), once, kept on the asset; the
// original person is named, never described; another user's picture is
// not read; a picture that cannot be read still leaves a description.
func TestRemakePromptDescribesTheSwappedPerson(t *testing.T) {
	a, one, _ := setup(t)
	ctx := t.Context()
	a.Media = &media.Service{Store: a.Store, Objects: &thumbnailObjects{}}
	a.Hot = &hotvideo.Service{Client: &hotvideo.Client{}, Store: a.Store}
	var calls atomic.Int32
	var asked atomic.Value
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		raw, _ := json.Marshal(body["messages"])
		asked.Store(string(raw))
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": "圆脸，黑色长波浪卷发，下巴有一颗小痣。"}}}})
	}))
	defer model.Close()
	a.Vision = &vision.Client{BaseURL: model.URL, Key: "k", Model: "m"}
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-a", Data: core.Data(map[string]any{"disabled": false})}, 0)
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "face", Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/face.png", "type": "image/png", "size": 1024})}, 0)
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "theirs", Owner: "user-b", Data: core.Data(map[string]any{"key": "uploads/b.png", "type": "image/png", "size": 1024})}, 0)
	old := hotvideo.BreakdownRecord{VideoID: "7301", Model: "m", Status: "done", Result: &vision.Breakdown{
		Subjects: []vision.Subject{{Name: "女主", Kind: "person", Look: "黑色长直发、灰色蕾丝领大衣"}},
		Shots:    []vision.Shot{{Start: 0, End: 6, Scene: "秋日街道。", Action: "【女主】向前走"}},
	}}
	_, _ = a.Store.Put(ctx, "hot_breakdowns", core.Record{ID: core.Digest("v3:m:7301")[:32], Data: core.Data(old)}, 0)
	j := core.NewJob("user-a", "remake-looks", core.JobInput{Kind: "import", Model: "hot-import", Purpose: hotvideo.RemakePurpose, SourceID: "7301", Duration: 6, Prompt: "一键复刻：秋日"})
	_, _ = a.Store.CreateJob(ctx, j)
	claimed, _ := a.Store.Claim(ctx)
	_ = a.Store.Finish(ctx, claimed, "asset:original", "")
	read := func(pictures []string) string {
		t.Helper()
		body := map[string]any{"job": j.ID, "seconds": 6, "limit": 20000, "images": 1, "swaps": []map[string]any{{"name": "女主", "picture": 1}}, "pictures": pictures}
		w := call(a, "POST", "/api/remake/prompt", one, "", body)
		var v struct{ Prompt string }
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &v) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		return v.Prompt
	}
	got := read([]string{"face"})
	if !strings.Contains(got, "仅将@视频1中的女主替换为@图片1中的人物") || !strings.Contains(got, "人物身份严格匹配@图片1（圆脸，黑色长波浪卷发，下巴有一颗小痣）：") || strings.Contains(got, "蕾丝领") || strings.Contains(got, "。，") {
		t.Fatal(got)
	}
	if q, _ := asked.Load().(string); !strings.Contains(q, "https://fixture.test/original") || !strings.Contains(q, "不描述衣服") {
		t.Fatal("the picture was not asked about as a face:", q)
	}
	if read([]string{"face"}); calls.Load() != 1 {
		t.Fatal("read again instead of kept:", calls.Load())
	}
	if got := read([]string{"theirs"}); calls.Load() != 1 || strings.Contains(got, "圆脸") {
		t.Fatal("another user's picture was read", got)
	}
	if got := read(nil); !strings.Contains(got, "人物身份严格匹配@图片1：") {
		t.Fatal("an older page (no pictures) should still get the prompt:", got)
	}
}
