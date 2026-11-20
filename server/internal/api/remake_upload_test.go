package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/media"
	"doubo/server/internal/vision"
	"encoding/json"
	"strings"
	"testing"
)

// 一键复刻 from an uploaded video: the remake task points at the user's own
// file, its preparation keeps that file, and only its owner can read the
// breakdown.
func TestRemakeFromAnUploadedVideo(t *testing.T) {
	a, one, two := setup(t)
	a.Media = &media.Service{Store: a.Store, Objects: &thumbnailObjects{}}
	vid := strings.Repeat("a", 32)
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: vid, Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/v", "type": "video/mp4", "size": 1024})}, 0)
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "pic", Owner: "user-a", Data: core.Data(map[string]any{"type": "image/png"})}, 0)
	body := map[string]any{"video": vid, "assets": []string{"pic"}, "title": "我的探店", "duration": 12}
	if w := call(a, "POST", "/api/remake/upload", two, "key-other-0001", body); w.Code != 400 {
		t.Fatal("someone else's video accepted", w.Code)
	}
	w := call(a, "POST", "/api/remake/upload", one, "key-upload-0001", body)
	var j core.Job
	if w.Code != 202 || json.Unmarshal(w.Body.Bytes(), &j) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if j.Input.Purpose != "remake" || j.Input.SourceID != "u"+vid || j.Input.Duration != 12 || !strings.HasPrefix(j.Input.Prompt, "一键复刻：我的探店") {
		t.Fatalf("%+v", j.Input)
	}
	// The preparation keeps the uploaded file (no Douyin source needed).
	importer := hotvideo.Importer{Service: &hotvideo.Service{Store: a.Store}, Media: a.Media}
	if result, err := importer.Generate(t.Context(), j); err != nil || result != "asset:"+vid {
		t.Fatal(result, err)
	}
	// Breakdowns of uploads: the owner may read, others may not.
	a.Hot = &hotvideo.Service{Client: &hotvideo.Client{}, Store: a.Store}
	a.Vision = &vision.Client{BaseURL: "http://127.0.0.1:1", Key: "k", Model: "m"}
	path := "/api/hot/videos/u" + vid + "/breakdown"
	if w := call(a, "GET", path, two, "", nil); w.Code != 404 || !strings.Contains(w.Body.String(), "视频不存在") {
		t.Fatal("another user reached an upload's breakdown", w.Code, w.Body.String())
	}
	if w := call(a, "GET", path, one, "", nil); w.Code != 404 || !strings.Contains(w.Body.String(), "还没有拆解") {
		t.Fatal("the owner should reach it (not broken down yet)", w.Code, w.Body.String())
	}
}
