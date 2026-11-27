package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/vision"
	"encoding/json"
	"strings"
	"testing"
)

// 生成同款's description comes from the owner's finished remake task and its
// breakdown; a v2 breakdown made before the upgrade is still used.
func TestRemakePromptFromTheTaskAndItsBreakdown(t *testing.T) {
	a, one, two := setup(t)
	ctx := t.Context()
	a.Hot = &hotvideo.Service{Client: &hotvideo.Client{}, Store: a.Store}
	a.Vision = &vision.Client{BaseURL: "https://vision.test", Key: "k", Model: "m"}
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-a", Data: core.Data(map[string]any{"disabled": false})}, 0)
	j := core.NewJob("user-a", "remake-fixture", core.JobInput{Kind: "import", Model: "hot-import", Purpose: hotvideo.RemakePurpose,
		SourceID: "7301", Duration: 6, Prompt: "一键复刻：祝福女儿\n文案"})
	_, _ = a.Store.CreateJob(ctx, j)
	body := map[string]any{"job": j.ID, "seconds": 6, "limit": 2000, "images": 1, "swaps": []map[string]any{{"name": "眼镜女生", "picture": 1}}}
	if w := call(a, "POST", "/api/remake/prompt", one, "", body); w.Code != 404 {
		t.Fatal("unfinished task accepted", w.Code)
	}
	claimed, _ := a.Store.Claim(ctx)
	if err := a.Store.Finish(ctx, claimed, "asset:original", ""); err != nil {
		t.Fatal(err)
	}
	if w := call(a, "POST", "/api/remake/prompt", two, "", body); w.Code != 404 {
		t.Fatal("someone else's task", w.Code)
	}
	bad := map[string]any{"job": j.ID, "seconds": 6, "limit": 2000, "images": 1, "swaps": []map[string]any{{"name": "眼镜女生", "picture": 2}}}
	if w := call(a, "POST", "/api/remake/prompt", one, "", bad); w.Code != 400 {
		t.Fatal("a picture that is not there", w.Code)
	}
	read := func() string {
		t.Helper()
		w := call(a, "POST", "/api/remake/prompt", one, "", body)
		var v struct{ Prompt string }
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &v) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		return v.Prompt
	}
	// No breakdown: the swaps were read from one that is gone, so the page
	// reloads its subjects; pictures alone go with the caption.
	if w := call(a, "POST", "/api/remake/prompt", one, "", body); w.Code != 409 {
		t.Fatal("swaps without their breakdown", w.Code, w.Body.String())
	}
	plain := map[string]any{"job": j.ID, "seconds": 6, "limit": 2000, "images": 4}
	if w := call(a, "POST", "/api/remake/prompt", one, "", plain); w.Code != 200 || !strings.Contains(w.Body.String(), `视频主题：祝福女儿\n原视频文案：文案`) {
		t.Fatal("no breakdown yet:", w.Code, w.Body.String())
	}
	old := hotvideo.BreakdownRecord{VideoID: "7301", Model: "m", Status: "done", Result: &vision.Breakdown{
		Subjects: []vision.Subject{{Name: "眼镜女生", Kind: "person"}},
		Shots:    []vision.Shot{{Start: 0, End: 6, Scene: "夜晚户外", Action: "眼镜女生微笑"}},
	}}
	_, _ = a.Store.Put(ctx, "hot_breakdowns", core.Record{ID: core.Digest("v2:m:7301")[:32], Data: core.Data(old)}, 0)
	if got := read(); !strings.Contains(got, "0–6秒：夜晚户外，@图片1中的人物微笑") {
		t.Fatal(got)
	}
	// A failed v3 run does not hide the v2 one; a finished v3 one wins.
	failed := hotvideo.BreakdownRecord{VideoID: "7301", Model: "m", Status: "failed", Error: "cut off"}
	_, _ = a.Store.Put(ctx, "hot_breakdowns", core.Record{ID: core.Digest("v3:m:7301")[:32], Data: core.Data(failed)}, 0)
	if got := read(); !strings.Contains(got, "@图片1中的人物微笑") {
		t.Fatal("v2 hidden by a failed v3:", got)
	}
	row, _ := a.Store.Get(ctx, "hot_breakdowns", core.Digest("v3:m:7301")[:32])
	done := hotvideo.BreakdownRecord{VideoID: "7301", Model: "m", Status: "done", Result: &vision.Breakdown{
		Subjects: []vision.Subject{{Name: "眼镜女生", Kind: "person"}},
		Shots:    []vision.Shot{{Start: 0, End: 6, Scene: "咖啡店", Action: "眼镜女生点单"}},
	}}
	_, _ = a.Store.Put(ctx, "hot_breakdowns", core.Record{ID: row.ID, Data: core.Data(done)}, row.Version)
	if got := read(); !strings.Contains(got, "咖啡店，@图片1中的人物点单") {
		t.Fatal(got)
	}
}
