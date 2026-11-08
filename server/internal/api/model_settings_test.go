package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestModelConfigurationReachesPublicCapabilitiesAndSurvivesSync(t *testing.T) {
	a, admin := modelServer(t)
	ctx := context.Background()
	call(a, "POST", "/api/admin/models/sync", admin, "", nil)
	id := core.Digest("image-live")[:32]
	row, _ := a.Store.Get(ctx, "models", id)
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.Settings = core.ModelSettings{Description: "精细图像", CostUSD: "0.023456", Modes: []string{"t2i"}, Qualities: []string{"high"}, Resolutions: []string{"1k"}, Ratios: []string{"1:1"}, MaxPromptChars: 10, DefaultPrompt: "default", Ideas: []string{"idea"}, PriceMatrix: map[string]map[string]float64{"high": {"1k": 7.5}}, ErrorHints: []core.ErrorHint{{Contains: "balance", Message: "请联系管理员"}}}
	w := call(a, "PUT", "/api/admin/models/"+id, admin, "", map[string]any{"version": row.Version, "data": m})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	current, _ := a.model(ctx, id)
	if current.Settings.PriceMatrix["high"]["1k"] != 7.5 || current.Settings.DefaultPrompt != "default" {
		t.Fatal("sync discarded configuration")
	}
	w = call(a, "GET", "/api/config", "", "", nil)
	var public struct {
		Models []core.Model `json:"models"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &public)
	if len(public.Models) != 1 {
		t.Fatal(w.Body.String())
	}
	v := public.Models[0]
	if len(v.Qualities) != 1 || v.Qualities[0] != "high" || len(v.Modes) != 1 || len(v.ReferenceTypes) != 0 {
		t.Fatal("public restrictions missing", v)
	}
	if v.Settings.CostUSD != "" || len(v.Settings.ErrorHints) > 0 {
		t.Fatal("private configuration leaked")
	}
	user, _ := a.Sessions.Create(ctx, "configuration-user", "user")
	input := core.JobInput{Kind: "image", Model: id, Prompt: "hello", Resolution: "1k", Ratio: "1:1", Quality: "low"}
	if w = call(a, "POST", "/api/jobs", user, "invalid-quality", input); w.Code != 400 {
		t.Fatal("disabled quality accepted")
	}
	input.Quality = "high"
	input.Prompt = "more than ten characters"
	if w = call(a, "POST", "/api/jobs", user, "long-prompt", input); w.Code != 400 {
		t.Fatal("prompt limit ignored")
	}
	input.Prompt = "hello"
	if _, err := a.Billing.Adjust(ctx, "configuration-user", "model-settings-credit", "admin", "测试配置模型扣费", 750); err != nil {
		t.Fatal(err)
	}
	approvedCost := int64(750)
	input.ExpectedCostUnits = &approvedCost
	if w = call(a, "POST", "/api/jobs", user, "valid-quality", input); w.Code != 202 {
		t.Fatal(w.Body.String())
	}
	row, _ = a.Store.Get(ctx, "models", id)
	_ = json.Unmarshal(row.Data, &m)
	m.Settings.AvailabilityStatus = "maintenance"
	if w = call(a, "PUT", "/api/admin/models/"+id, admin, "", map[string]any{"version": row.Version, "data": m}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = call(a, "POST", "/api/jobs", user, "maintenance-block", input); w.Code != 400 {
		t.Fatal("maintenance allowed a new generation")
	}
}

func TestConfiguredReferenceLimits(t *testing.T) {
	m := core.Model{Kind: "image", Settings: core.ModelSettings{MaxRefImages: 1, MaxRefImageSizeMB: 1}}
	if validateModelReferences(m, "i2i", map[string]int{"image": 2}, nil) == nil {
		t.Fatal("reference count ignored")
	}
	if validateModelReferences(m, "i2i", map[string]int{"image": 1}, map[string][]int64{"image": {2 << 20}}) == nil {
		t.Fatal("reference size ignored")
	}
	m.Kind = "video"
	m.Settings.OmniReferences = map[string]bool{"video": false}
	if validateModelReferences(m, "omni_ref", map[string]int{"video": 1}, nil) == nil {
		t.Fatal("disabled video reference accepted")
	}
}
