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

// 重新拆解 runs again a finished breakdown that is old (v2, no 【】 marks) or
// found nobody, not a good one, and not within minutes of the last run; its
// poll (fresh) sees that run, not the older result.
func TestRedoBreakdownOnlyWhenItHelps(t *testing.T) {
	a, one, _ := setup(t)
	ctx := t.Context()
	a.Media = &media.Service{Store: a.Store, Objects: &thumbnailObjects{}}
	a.Hot = &hotvideo.Service{Client: &hotvideo.Client{}, Store: a.Store}
	var calls atomic.Int32
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		answer := `{"subjects":[{"name":"主角","kind":"person"}],"shots":[{"start":0,"end":3,"scene":"卧室","action":"【主角】撕开快递"}]}`
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": answer}}}})
	}))
	defer model.Close()
	a.Vision = &vision.Client{BaseURL: model.URL, Key: "k", Model: "m"}
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "clip", Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/clip", "type": "video/mp4", "size": 1024, "sourceVideoId": "7301"})}, 0)
	old := hotvideo.BreakdownRecord{VideoID: "7301", Model: "m", Status: "done", FinishedAt: time.Now().Add(-time.Hour),
		Result: &vision.Breakdown{Shots: []vision.Shot{{Start: 0, End: 3, Action: "穿格子衬衫的女生撕开快递"}}}}
	_, _ = a.Store.Put(ctx, "hot_breakdowns", core.Record{ID: core.Digest("v2:m:7301")[:32], Data: core.Data(old)}, 0)
	path := "/api/hot/videos/7301/breakdown"
	wait := func() map[string]any {
		t.Helper()
		for range 100 {
			var v map[string]any
			_ = json.Unmarshal(call(a, "GET", path+"?fresh=1", one, "", nil).Body.Bytes(), &v)
			if v["status"] == "done" {
				return v
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Fatal("never done")
		return nil
	}
	// An old (v2) breakdown: run again, and the poll waits for that run.
	if w := call(a, "POST", path, one, "", map[string]string{"assetId": "clip"}); w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	if v := wait(); calls.Load() != 1 || v["result"].(map[string]any)["subjects"] == nil {
		t.Fatal(calls.Load(), v)
	}
	// A good one is not run again.
	if w := call(a, "POST", path, one, "", map[string]string{"assetId": "clip"}); w.Code != 200 || calls.Load() != 1 {
		t.Fatal("a good breakdown ran again", w.Code, calls.Load())
	}
	// One that found nobody runs again, but not within minutes of its run.
	row, _ := a.Store.Get(ctx, "hot_breakdowns", core.Digest("v3:m:7301")[:32])
	nobody := hotvideo.BreakdownRecord{VideoID: "7301", Model: "m", Status: "done", FinishedAt: time.Now(),
		Result: &vision.Breakdown{Shots: []vision.Shot{{Start: 0, End: 3, Action: "风景"}}}}
	row.Data = core.Data(nobody)
	_, _ = a.Store.Put(ctx, "hot_breakdowns", row, row.Version)
	if w := call(a, "POST", path, one, "", map[string]string{"assetId": "clip"}); w.Code != 200 || calls.Load() != 1 {
		t.Fatal("ran again right after the last run", w.Code, calls.Load())
	}
	row, _ = a.Store.Get(ctx, "hot_breakdowns", row.ID)
	nobody.FinishedAt = time.Now().Add(-10 * time.Minute)
	row.Data = core.Data(nobody)
	_, _ = a.Store.Put(ctx, "hot_breakdowns", row, row.Version)
	if w := call(a, "POST", path, one, "", map[string]string{"assetId": "clip"}); w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	if wait(); calls.Load() != 2 {
		t.Fatal("found nobody: not run again", calls.Load())
	}
}
