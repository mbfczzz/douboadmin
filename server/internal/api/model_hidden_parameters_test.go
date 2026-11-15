package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestHiddenModelParametersSurviveSaveAndSyncWithoutBreakingGeneration(t *testing.T) {
	a, admin := modelServer(t)
	if w := call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	id := core.Digest("image-live")[:32]
	row, _ := a.Store.Get(t.Context(), "models", id)
	var model core.Model
	_ = json.Unmarshal(row.Data, &model)
	model.Settings = core.ModelSettings{
		HideQuality: true, HideResolution: true,
		Qualities: []string{}, Resolutions: []string{},
		PriceMatrix: map[string]map[string]float64{"low": {"1k": 4}},
	}
	path := "/api/admin/models/" + id
	if w := call(a, "PUT", path, admin, "", map[string]any{"version": row.Version, "data": model}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w := call(a, "GET", "/api/config", "", "", nil)
	var config struct {
		Models []core.Model `json:"models"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &config); err != nil || len(config.Models) != 1 {
		t.Fatal(w.Body.String(), err)
	}
	visible := config.Models[0]
	if !visible.Settings.HideQuality || !visible.Settings.HideResolution || !visible.Usable() {
		t.Fatal("hidden flags lost or model made unavailable", visible)
	}
	if len(visible.Qualities) != 2 || visible.Qualities[0] != "low" || visible.Resolutions[0] != "1k" {
		t.Fatal("usable defaults lost")
	}
	user, _ := a.Sessions.Create(t.Context(), "hidden-parameters-user", "user")
	w = call(a, "GET", "/api/jobs/estimate?kind=image&model="+id+"&resolution=1k&quality=low&ratio=1:1", user, "", nil)
	var quote struct {
		Units int64 `json:"units"`
	}
	if json.Unmarshal(w.Body.Bytes(), &quote) != nil || w.Code != 200 || quote.Units != 400 {
		t.Fatal("hidden parameter pricing changed", w.Code, w.Body.String())
	}
	if _, err := a.Billing.Adjust(t.Context(), "hidden-parameters-user", "hidden-params-credit", "admin", "测试隐藏参数", 400); err != nil {
		t.Fatal(err)
	}
	input := core.JobInput{Kind: "image", Model: id, Prompt: "test", Resolution: "1k", Quality: "low", Ratio: "1:1", ExpectedCostUnits: &quote.Units}
	if w = call(a, "POST", "/api/jobs", user, "hidden-params-job", input); w.Code != 202 {
		t.Fatal(w.Body.String())
	}
	row, _ = a.Store.Get(t.Context(), "models", id)
	_ = json.Unmarshal(row.Data, &model)
	model.Settings.HideQuality, model.Settings.HideResolution = false, false
	model.Settings.Qualities, model.Settings.Resolutions = []string{"high"}, []string{"1k"}
	if w = call(a, "PUT", path, admin, "", map[string]any{"version": row.Version, "data": model}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	fresh, _ := a.model(t.Context(), id)
	if fresh.Settings.HideQuality || fresh.Settings.HideResolution || len(fresh.Qualities) != 1 || fresh.Qualities[0] != "high" {
		t.Fatal("restoring selection failed")
	}
}
