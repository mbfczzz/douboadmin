package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/media"
	"doubo/server/internal/vision"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// The breakdown runs once per video in the background, is shared by
// everyone, needs the caller's own saved video, and a failure can be retried.
func TestHotBreakdownSharedAndRetryable(t *testing.T) {
	a, one, two := setup(t)
	a.Media = &media.Service{Store: a.Store, Objects: &thumbnailObjects{}}
	a.Hot = &hotvideo.Service{Client: &hotvideo.Client{}, Store: a.Store}
	var calls atomic.Int32
	var failing atomic.Bool
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if failing.Load() {
			w.WriteHeader(401)
			return
		}
		answer := `{"hook":"撕快递","shots":[{"start":0,"end":3,"scene":"卧室","action":"撕开快递","camera":"手持","speech":""}]}`
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": answer}}}})
	}))
	defer model.Close()
	a.Vision = &vision.Client{BaseURL: model.URL, Key: "k", Model: "doubao-seed-1-6-vision-250815"}
	for id, owner := range map[string]string{"clip-a": "user-a", "clip-b": "user-b"} {
		_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: id, Owner: owner, Data: core.Data(map[string]any{"key": "uploads/" + id, "type": "video/mp4", "size": 1024})}, 0)
	}
	path := "/api/hot/videos/7301/breakdown"
	if w := call(a, "POST", path, one, "", map[string]string{"assetId": "clip-b"}); w.Code != 400 {
		t.Fatal("someone else's video accepted", w.Code)
	}
	failing.Store(true)
	if w := call(a, "POST", path, one, "", map[string]string{"assetId": "clip-a"}); w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	wait := func(want string) map[string]any {
		t.Helper()
		for range 100 {
			var v map[string]any
			_ = json.Unmarshal(call(a, "GET", path, one, "", nil).Body.Bytes(), &v)
			if v["status"] == want {
				return v
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Fatalf("never reached %s", want)
		return nil
	}
	if v := wait("failed"); v["error"] != "视频理解 API Key 无效" {
		t.Fatal(v)
	}
	failing.Store(false)
	call(a, "POST", path, one, "", map[string]string{"assetId": "clip-a"})
	v := wait("done")
	if v["result"].(map[string]any)["hook"] != "撕快递" || calls.Load() != 2 {
		t.Fatal(v, calls.Load())
	}
	if w := call(a, "POST", path, two, "", map[string]string{"assetId": "clip-b"}); w.Code != 200 || calls.Load() != 2 {
		t.Fatal("shared result not reused", w.Code, calls.Load())
	}
	a.Vision = &vision.Client{}
	if w := call(a, "GET", path, one, "", nil); w.Code != 503 {
		t.Fatal("unconfigured vision should say so", w.Code)
	}
}

// A remake preparation keeps the original's details and only the caller's
// own pictures; plain imports stay as they were.
func TestRemakeImportInput(t *testing.T) {
	a, one, _ := setup(t)
	a.Hot = &hotvideo.Service{Client: &hotvideo.Client{BaseURL: "https://tikhub.test", Key: "k"}, Store: a.Store}
	for id, data := range map[string]map[string]any{"pic-a": {"key": "u/a", "type": "image/jpeg"}, "clip-a": {"key": "u/c", "type": "video/mp4"}} {
		_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: id, Owner: "user-a", Data: core.Data(data)}, 0)
	}
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "pic-b", Owner: "user-b", Data: core.Data(map[string]any{"key": "u/b", "type": "image/jpeg"})}, 0)
	path := "/api/hot/videos/7301/import"
	body := map[string]any{"purpose": "remake", "assets": []string{"pic-a"}, "title": "开箱口红", "text": "黄皮也能涂", "duration": 18}
	for _, bad := range []map[string]any{
		{"purpose": "remake", "assets": []string{"pic-b"}},
		{"purpose": "remake", "assets": []string{"clip-a"}},
		{"purpose": "other"},
	} {
		if w := call(a, "POST", path, one, "key-bad-"+bad["purpose"].(string)+string(rune('a'+len(bad))), bad); w.Code != 400 {
			t.Fatal("accepted", bad, w.Code)
		}
	}
	w := call(a, "POST", path, one, "key-remake-1", body)
	var j core.Job
	if w.Code != 202 || json.Unmarshal(w.Body.Bytes(), &j) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if j.Input.Purpose != "remake" || j.Input.Prompt != "一键复刻：开箱口红\n黄皮也能涂" || j.Input.Duration != 18 || len(j.Input.Assets) != 1 || j.Input.SourceID != "7301" {
		t.Fatalf("%+v", j.Input)
	}
	w = call(a, "POST", path, one, "key-plain-1", map[string]any{})
	j = core.Job{}
	_ = json.Unmarshal(w.Body.Bytes(), &j)
	if w.Code != 202 || j.Input.Purpose != "" || j.Input.Prompt != "导入抖音视频素材" {
		t.Fatalf("plain import changed: %d %+v", w.Code, j.Input)
	}
}
