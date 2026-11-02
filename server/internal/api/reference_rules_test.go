package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestPublicReferenceRulesFollowOperatorAndUpstreamLimits(t *testing.T) {
	a, _, _ := setup(t)
	ctx := context.Background()
	row, e := a.Store.Get(ctx, "models", "demo-image")
	if e != nil {
		t.Fatal(e)
	}
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.ReferenceTypes = []string{"image"}
	m.Settings.MaxRefImages = 8
	m.Settings.MaxRefImageSizeMB = 2
	m.ParamsSchema = core.Data(map[string]any{"edit_images": map[string]int{"max": 6}})
	row.Data = core.Data(m)
	row, e = a.Store.Put(ctx, "models", row, row.Version)
	if e != nil {
		t.Fatal(e)
	}
	read := func() core.Model {
		w := call(a, "GET", "/api/config", "", "", nil)
		var v struct {
			Models []core.Model `json:"models"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &v) != nil || len(v.Models) != 1 {
			t.Fatal(w.Code, w.Body.String())
		}
		return v.Models[0]
	}
	got := read()
	if got.ReferenceRules["i2i"]["image"].MaxCount != 6 || got.ReferenceRules["i2i"]["image"].MaxSizeMB != 2 {
		t.Fatal(got.ReferenceRules)
	}
	m.Settings.MaxRefImages = 2
	row.Data = core.Data(m)
	if _, e = a.Store.Put(ctx, "models", row, row.Version); e != nil {
		t.Fatal(e)
	}
	if read().ReferenceRules["i2i"]["image"].MaxCount != 2 {
		t.Fatal("updated setting not reflected")
	}
	m.Settings.Modes = []string{"t2i"}
	got = m.Effective()
	if len(got.ReferenceTypes) != 0 || len(publicReferenceRules(got)) != 0 {
		t.Fatal("disabled image mode still exposes upload")
	}
}

func TestVideoPublicReferenceRulesArePerTypeAndMode(t *testing.T) {
	m := core.Model{Kind: "video", Modes: []string{"i2v", "keyframe", "omni_ref"}, ReferenceTypes: []string{"image", "video", "audio"}, ParamsSchema: core.Data(map[string]any{"ref_limits": map[string]int{"video": 2}})}
	m.Settings.RefLimits = map[string]float64{"omniRef.videoCount": 4, "omniRef.videoSizeMB": 10, "keyframe.imageSizeMB": 3}
	m.Settings.OmniReferences = map[string]bool{"audio": false}
	rules := publicReferenceRules(m.Effective())
	if rules["omni_ref"]["video"].MaxCount != 2 || rules["omni_ref"]["video"].MaxSizeMB != 10 || rules["keyframe"]["image"].MaxCount != 2 || rules["keyframe"]["image"].MaxSizeMB != 3 || rules["i2v"]["image"].MaxCount != 1 {
		t.Fatal(rules)
	}
	if _, ok := rules["omni_ref"]["audio"]; ok {
		t.Fatal("disabled audio exposed")
	}
}
