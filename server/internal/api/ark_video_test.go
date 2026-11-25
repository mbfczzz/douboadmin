package api

import (
	"context"
	"doubo/server/internal/arkvideo"
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The fixed Seedance models: listed without the relay, quoted 按量 for the
// most a task can cost, refused while the 火山方舟 key is missing, and left
// alone by the relay catalog sync.
func TestSeedanceModelsQuoteAndSurviveSync(t *testing.T) {
	a, user, _ := setup(t)
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(upstreamCatalog)) }))
	t.Cleanup(up.Close)
	a.Relay = relay.New(up.URL, "secret-catalog")
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	ctx := context.Background()
	if err := arkvideo.Ensure(ctx, a.Store, true); err != nil {
		t.Fatal(err)
	}
	id := arkvideo.ModelID("doubao-seedance-2-0-260128")
	in := core.JobInput{Kind: "video", Model: id, Prompt: "海边日落", Resolution: "720p", Ratio: "16:9", Duration: 5, Mode: "t2v"}
	if w := call(a, "POST", "/api/jobs/quote", user, "", in); w.Code != 400 {
		t.Fatal("quoted without the 火山方舟 key", w.Code, w.Body.String())
	}
	a.ArkVideo = &arkvideo.Client{BaseURL: "https://ark.example/api/v3", Key: "k"}
	w := call(a, "POST", "/api/jobs/quote", user, "", in)
	var q struct {
		Units    int64 `json:"units"`
		PerToken bool  `json:"perToken"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &q) != nil || q.Units != 5714 || !q.PerToken {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	m, _ := a.model(ctx, id)
	if !m.Available || m.Key != core.ArkVideoPrefix+"doubao-seedance-2-0-260128" {
		t.Fatal("sync hid or changed a fixed model", m)
	}
	var config struct {
		Models []core.Model `json:"models"`
	}
	_ = json.Unmarshal(call(a, "GET", "/api/config", "", "", nil).Body.Bytes(), &config)
	listed := 0
	for _, m := range config.Models {
		if _, ok := core.ArkVideo(m.Key); ok {
			listed++
		}
	}
	if listed != 5 {
		t.Fatal("public catalog lists", listed)
	}
}
