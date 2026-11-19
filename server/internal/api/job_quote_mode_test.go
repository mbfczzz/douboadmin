package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

// The points confirm says 按秒 only when the video price came from the
// duration × resolution table.
func TestJobQuoteReportsPerSecondPricing(t *testing.T) {
	a, user, _ := estimateFixture(t)
	m := core.Model{ID: "per-second", Key: "video-test", Kind: "video", Published: true, Available: true, Points: 9,
		Resolutions: []string{"720p"}, Ratios: []string{"9:16"}, Durations: []int{5}, Modes: []string{"t2v"},
		Settings: core.ModelSettings{PriceMatrix: map[string]map[string]float64{"5s": {"720p": 35}}}}
	if _, err := a.Store.Put(context.Background(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0); err != nil {
		t.Fatal(err)
	}
	quote := func(in core.JobInput) (out struct {
		Units     int64 `json:"units"`
		PerSecond bool  `json:"perSecond"`
	}) {
		t.Helper()
		w := call(a, "POST", "/api/jobs/quote", user, "", in)
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
			t.Fatalf("quote failed: %d %s", w.Code, w.Body.String())
		}
		return
	}
	if q := quote(core.JobInput{Kind: "video", Model: m.ID, Prompt: "海边", Resolution: "720p", Ratio: "9:16", Duration: 5}); !q.PerSecond {
		t.Fatal("duration-table video not reported as 按秒", q)
	}
	m.Settings = core.ModelSettings{VideoBillingMode: "per_request", PricePerRequestByResolution: map[string]float64{"720p": 20}}
	if _, err := a.Store.Put(context.Background(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 1); err != nil {
		t.Fatal(err)
	}
	if q := quote(core.JobInput{Kind: "video", Model: m.ID, Prompt: "海边", Resolution: "720p", Ratio: "9:16", Duration: 5}); q.PerSecond || q.Units != 2000 {
		t.Fatal("per-request video reported as 按秒", q)
	}
}
