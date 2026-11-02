package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/objectstore"
	"doubo/server/internal/provider"
	"encoding/json"
	"testing"
)

func TestInferredModesAreCompatibleAndReachProvider(t *testing.T) {
	for _, mode := range []string{"omni_ref", "keyframe"} {
		a, _, _ := setup(t)
		ctx := context.Background()
		a.Objects = objectstore.New("cn-hangzhou", "test-bucket", "test-key", "test-secret")
		m := core.Model{ID: "video", Kind: "video", Key: "fixture", Published: true, Available: true, Modes: []string{mode}, ReferenceTypes: []string{"image"}, Resolutions: []string{"720p"}, Ratios: []string{"9:16"}, Durations: []int{5}}
		_, _ = a.Store.Put(ctx, "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
		_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "photo", Owner: "user-a", Data: core.Data(map[string]any{"type": "image/jpeg", "size": 1024})}, 0)
		input := core.JobInput{Kind: "video", Model: m.ID, Prompt: "test", Resolution: "720p", Ratio: "9:16", Duration: 5, Assets: []string{"photo"}}
		if mode == "keyframe" {
			input.Assets = append(input.Assets, "photo")
		}
		if e := a.validateJob(ctx, "user-a", &input); e != nil {
			t.Fatal(mode, e)
		}
		if input.Mode != mode {
			t.Fatal("inferred mode not persisted", mode, input.Mode)
		}
		_, body, e := provider.Request(input, m.Key, nil)
		if e != nil || body["mode"] != mode {
			t.Fatal(body, e)
		}
	}
}
func TestMinimumReferencesAndModeResolutionContract(t *testing.T) {
	a, _, _ := setup(t)
	ctx := context.Background()
	a.Objects = objectstore.New("cn-hangzhou", "test-bucket", "test-key", "test-secret")
	row, _ := a.Store.Get(ctx, "models", "demo-image")
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.ReferenceTypes = []string{"image"}
	m.Resolutions = []string{"1K", "2K"}
	m.ParamsSchema = core.Data(map[string]any{"edit_images": map[string]int{"min": 2, "max": 4}, "resolution_by_mode": map[string][]string{"i2i": {"1K"}}})
	row.Data = core.Data(m)
	_, _ = a.Store.Put(ctx, "models", row, row.Version)
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "photo", Owner: "user-a", Data: core.Data(map[string]any{"type": "image/jpeg", "size": 1024})}, 0)
	input := core.JobInput{Kind: "image", Model: m.ID, Prompt: "test", Resolution: "1K", Ratio: "1:1", Assets: []string{"photo"}}
	if e := a.validateJob(ctx, "user-a", &input); e == nil {
		t.Fatal("too few references accepted")
	}
	w := call(a, "GET", "/api/config", "", "", nil)
	var c struct {
		Models []core.Model `json:"models"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &c)
	if c.Models[0].ReferenceRules["i2i"]["image"].MinCount != 2 || len(c.Models[0].ResolutionByMode["i2i"]) != 1 {
		t.Fatal(c.Models[0])
	}
	m.Settings.Resolutions = []string{"2K"}
	limited := publicModeResolutions(m.Effective())
	if list, exists := limited["i2i"]; !exists || len(list) != 0 {
		t.Fatal("impossible resolution combination not exposed", limited)
	}
}
