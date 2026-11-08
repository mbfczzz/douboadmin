package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"net/url"
	"strconv"
	"testing"
)

func estimateFixture(t *testing.T) (*Server, string, core.Model) {
	t.Helper()
	a, user, _ := setup(t)
	settings := core.DefaultPlatform()
	settings.BillingEnabled = true
	if _, err := a.Store.Put(context.Background(), "settings", core.Record{ID: "platform", Data: core.Data(settings)}, 0); err != nil {
		t.Fatal(err)
	}
	m := core.Model{ID: "priced", Key: "image-test", Kind: "image", Published: true, Available: true,
		Points: 1.25, Resolutions: []string{"1k", "2k"}, Ratios: []string{"1:1"}, Qualities: []string{"low", "high"}, Modes: []string{"i2i"},
		Settings: core.ModelSettings{PriceMatrix: map[string]map[string]float64{"low": {"1k": 2.5, "2k": 4}, "high": {"1k": 6.25, "2k": 0}}}}
	if _, err := a.Store.Put(context.Background(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0); err != nil {
		t.Fatal(err)
	}
	return a, user, m
}

func estimateURL(in core.JobInput) string {
	v := url.Values{"kind": {in.Kind}, "model": {in.Model}, "resolution": {in.Resolution}, "ratio": {in.Ratio}, "quality": {in.Quality}, "duration": {strconv.Itoa(in.Duration)}}
	return "/api/jobs/estimate?" + v.Encode()
}

func assertEstimate(t *testing.T, a *Server, user string, in core.JobInput, units int64, enabled bool) {
	t.Helper()
	w := call(a, "GET", estimateURL(in), user, "", nil)
	var got struct {
		Units   int64 `json:"units"`
		Enabled bool  `json:"billingEnabled"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &got) != nil || got.Units != units || got.Enabled != enabled {
		t.Fatalf("unexpected estimate: %d %s", w.Code, w.Body.String())
	}
}

func TestJobEstimateUsesConfiguredPricesWithoutPromptAssetsOrBalance(t *testing.T) {
	a, user, _ := estimateFixture(t)
	in := core.JobInput{Kind: "image", Model: "priced", Resolution: "1k", Ratio: "1:1", Quality: "low"}
	assertEstimate(t, a, user, in, 250, true)
	in.Resolution = "2k"
	assertEstimate(t, a, user, in, 400, true)
	in.Quality, in.Resolution = "high", "1k"
	assertEstimate(t, a, user, in, 625, true)
	in.Resolution = "2k"
	assertEstimate(t, a, user, in, 0, true) // Explicit zero price is valid.
	for _, kind := range []string{"jobs", "wallets", "wallet_ledger"} {
		rows, err := a.Store.List(context.Background(), kind, "user-a")
		if err != nil || len(rows) != 0 {
			t.Fatalf("estimating changed %s: %v %v", kind, rows, err)
		}
	}
	// Estimation must not weaken submission's prompt/reference validation.
	for _, path := range []string{"/api/jobs/quote", "/api/jobs"} {
		if w := call(a, "POST", path, user, "no-prompt", in); w.Code != 400 {
			t.Fatalf("blank prompt accepted at %s: %d", path, w.Code)
		}
	}
}

func TestJobEstimateTracksDurationAndPerRequestVideoPricing(t *testing.T) {
	a, user, m := estimateFixture(t)
	m.ID, m.Key, m.Kind, m.Modes = "video-priced", "video-test", "video", []string{"t2v"}
	m.Qualities, m.Durations = nil, []int{5, 10}
	m.Settings.PriceMatrix = map[string]map[string]float64{"5s": {"1k": 8}, "10s": {"1k": 20}}
	row, err := a.Store.Put(context.Background(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
	if err != nil {
		t.Fatal(err)
	}
	in := core.JobInput{Kind: "video", Model: m.ID, Resolution: "1k", Ratio: "1:1", Duration: 5}
	assertEstimate(t, a, user, in, 800, true)
	in.Duration = 10
	assertEstimate(t, a, user, in, 2000, true)
	m.Settings.VideoBillingMode = "per_request"
	m.Settings.PricePerRequestByResolution = map[string]float64{"1k": 9}
	if _, err = a.Store.Put(context.Background(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, row.Version); err != nil {
		t.Fatal(err)
	}
	assertEstimate(t, a, user, in, 900, true)
	in.Duration = 5
	assertEstimate(t, a, user, in, 900, true)
}

func TestJobEstimateHonorsBillingSwitchAndFallbackPrice(t *testing.T) {
	a, user, m := estimateFixture(t)
	m.Settings.PriceMatrix = nil
	row, _ := a.Store.Get(context.Background(), "models", m.ID)
	if _, err := a.Store.Put(context.Background(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, row.Version); err != nil {
		t.Fatal(err)
	}
	in := core.JobInput{Kind: "image", Model: m.ID, Resolution: "1k", Ratio: "1:1", Quality: "low"}
	assertEstimate(t, a, user, in, 125, true)
	platform, settings, err := a.platform(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	settings.BillingEnabled = false
	if _, err = a.Store.Put(context.Background(), "settings", core.Record{ID: "platform", Data: core.Data(settings)}, platform.Version); err != nil {
		t.Fatal(err)
	}
	assertEstimate(t, a, user, in, 0, false)
}

func TestJobEstimateRejectsUnsupportedParametersAndInactiveUsers(t *testing.T) {
	a, user, _ := estimateFixture(t)
	base := core.JobInput{Kind: "image", Model: "priced", Resolution: "1k", Ratio: "1:1", Quality: "low"}
	for _, change := range []func(*core.JobInput){
		func(in *core.JobInput) { in.Kind = "chat" },
		func(in *core.JobInput) { in.Kind = "video" },
		func(in *core.JobInput) { in.Resolution = "8k" },
		func(in *core.JobInput) { in.Ratio = "3:7" },
		func(in *core.JobInput) { in.Quality = "invalid" },
		func(in *core.JobInput) { in.Duration = -1 },
	} {
		in := base
		change(&in)
		if w := call(a, "GET", estimateURL(in), user, "", nil); w.Code != 400 {
			t.Fatalf("invalid parameters accepted: %d %s", w.Code, w.Body.String())
		}
	}
	if w := call(a, "GET", estimateURL(base), "", "", nil); w.Code != 401 {
		t.Fatal("anonymous estimate accepted", w.Code)
	}
	a, user, _ = activationFixture(t)
	if w := call(a, "GET", estimateURL(base), user, "", nil); w.Code != 403 {
		t.Fatal("inactive user bypassed activation", w.Code)
	}
}
