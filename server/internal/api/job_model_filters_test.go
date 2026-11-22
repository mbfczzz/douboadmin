package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"net/url"
	"testing"
	"time"
)

func TestAdminJobModelCategoriesFilterBeforePaging(t *testing.T) {
	a, _, admin := activationFixture(t)
	stamp := time.Date(2026, 11, 21, 4, 0, 0, 0, time.UTC)
	add := func(kind, model string, index int) {
		j := core.NewJob("user-a", fmt.Sprintf("category-%s-%d", kind, index), core.JobInput{Kind: kind, Model: model, Prompt: "model-group-marker"})
		j.CreatedAt, j.Status = stamp, "running"
		if _, err := a.Store.CreateJob(t.Context(), j); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 25; i++ {
		image, video := "image-a", "video-a"
		if i == 24 {
			image, video = "removed-image", "video-b"
		}
		add("image", image, i)
		add("video", video, i)
	}
	add("mix", "video-a", 0)
	add("chat", "chat-a", 0)
	for _, tc := range []struct {
		kind, model, status string
		page, total, count  int
	}{
		{"image", "", "running", 1, 25, 20},
		{"image", "", "running", 2, 25, 5},
		{"image", "image-a", "running", 2, 24, 4},
		{"image", "removed-image", "running", 1, 1, 1},
		{"video", "", "running", 2, 26, 6},
		{"video", "video-a", "running", 1, 25, 20},
		{"video", "video-b", "running", 1, 1, 1},
		{"image", "video-a", "running", 1, 0, 0},
		{"video", "", "failed", 1, 0, 0},
		{"", "", "running", 1, 52, 20},
	} {
		query := url.Values{"kind": {tc.kind}, "model": {tc.model}, "status": {tc.status}, "page": {fmt.Sprint(tc.page)}, "q": {"model-group-marker"}, "from": {"2026-11-21"}, "to": {"2026-11-21"}}
		w := call(a, "GET", "/api/admin/jobs?"+query.Encode(), admin, "", nil)
		var page core.JobPage
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != tc.total || len(page.Items) != tc.count {
			t.Fatalf("%+v: status=%d total=%d items=%d body=%s", tc, w.Code, page.Total, len(page.Items), w.Body.String())
		}
		for _, j := range page.Items {
			if tc.kind != "" && j.Input.Kind != tc.kind && !(tc.kind == "video" && j.Input.Kind == "mix") || tc.model != "" && j.Input.Model != tc.model {
				t.Fatalf("wrong category/model: %+v", j.Input)
			}
		}
	}
}
