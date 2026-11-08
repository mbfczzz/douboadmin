package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestPlatformBillingDefaultsAndExplicitOverride(t *testing.T) {
	for _, test := range []struct {
		name string
		data map[string]any
		want bool
	}{
		{name: "new installation", want: true},
		{name: "legacy settings without a billing flag", data: map[string]any{"pointsPerYuan": 200}, want: true},
		{name: "explicitly enabled", data: map[string]any{"billingEnabled": true}, want: true},
		{name: "explicitly disabled", data: map[string]any{"billingEnabled": false}, want: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			a, _, _ := setup(t)
			if test.data != nil {
				if _, err := a.Store.Put(t.Context(), "settings", core.Record{ID: "platform", Data: core.Data(test.data)}, 0); err != nil {
					t.Fatal(err)
				}
			}
			for range 2 {
				_, settings, err := a.platform(t.Context())
				if err != nil || settings.BillingEnabled != test.want {
					t.Fatalf("billing enabled: %v, want %v, error: %v", settings.BillingEnabled, test.want, err)
				}
				if test.name == "legacy settings without a billing flag" && settings.PointsPerYuan != 200 {
					t.Fatal("loading billing defaults reset existing settings")
				}
			}
		})
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

func TestAdminBillingTogglePersistsWithoutResettingOtherSettings(t *testing.T) {
	a, _, _ := setup(t)
	admin, err := a.Sessions.Create(t.Context(), "admin", "admin")
	if err != nil {
		t.Fatal(err)
	}
	settings := core.DefaultPlatform()
	settings.PointsPerYuan = 200
	settings.SupportText = "测试联系说明"
	version := int64(0)
	for _, enabled := range []bool{false, true} {
		settings.BillingEnabled = enabled
		w := call(a, "PUT", "/api/admin/platform", admin, "", map[string]any{"version": version, "data": settings})
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		row, persisted, err := a.platform(t.Context())
		if err != nil || row.Version != version+1 || persisted.BillingEnabled != enabled || persisted.PointsPerYuan != 200 || persisted.SupportText != settings.SupportText {
			t.Fatal("saved platform settings did not persist", row, persisted, err)
		}
		version = row.Version
	}
}
