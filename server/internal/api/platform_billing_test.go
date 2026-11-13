package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestRetiredPlatformOverridesNeverControlRuntime(t *testing.T) {
	a, _, _ := setup(t)
	row, current, err := a.platform(t.Context())
	if err != nil || row.Version != 0 || string(core.Data(current)) != string(core.Data(core.DefaultPlatform())) {
		t.Fatal(row, current, err)
	}
}

func TestDefaultBillingQuotesAndRejectsInsufficientBalance(t *testing.T) {
	a, user, _ := setup(t)
	ctx := context.Background()
	row, err := a.Store.Get(ctx, "models", "demo-image")
	if err != nil {
		t.Fatal(err)
	}
	var model core.Model
	if err = json.Unmarshal(row.Data, &model); err != nil {
		t.Fatal(err)
	}
	model.Points = 2
	row.Data = core.Data(model)
	if _, err = a.Store.Put(ctx, "models", row, row.Version); err != nil {
		t.Fatal(err)
	}
	in := core.JobInput{Kind: "image", Model: model.ID, Resolution: "1K", Ratio: "1:1", Prompt: "test"}
	assertEstimate(t, a, user, in, 200, true)
	w := call(a, "POST", "/api/jobs/quote", user, "", in)
	var quote struct {
		Units      int64 `json:"units"`
		Enabled    bool  `json:"billingEnabled"`
		Sufficient bool  `json:"sufficient"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &quote) != nil || !quote.Enabled || quote.Units != 200 || quote.Sufficient {
		t.Fatal("default billing did not quote the configured price", w.Code, w.Body.String())
	}
	in.ExpectedCostUnits = &quote.Units
	if w = call(a, "POST", "/api/jobs", user, "default-billing-test", in); w.Code != 402 {
		t.Fatal("insufficient points bypassed default billing", w.Code, w.Body.String())
	}
	jobs, err := a.Store.List(ctx, "jobs", "user-a")
	if err != nil || len(jobs) != 0 {
		t.Fatal("a task was created despite insufficient points", jobs, err)
	}
}

func TestRetiredPlatformWriteIsRejected(t *testing.T) {
	a, _, _ := setup(t)
	admin, err := adminLoginToken(t, a, "admin", "Tt661ea2"), error(nil)
	if err != nil {
		t.Fatal(err)
	}
	w := call(a, "PUT", "/api/admin/platform", admin, "", map[string]any{"version": 0, "data": core.DefaultPlatform()})
	if w.Code != 410 {
		t.Fatal(w.Code, w.Body.String())
	}
}
