package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"doubo/server/internal/relay"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConfiguredVideoParametersReachRelayUnchangedAndRejectionRefunds(t *testing.T) {
	a, user, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	var received map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/openapi/v1/generations" {
			t.Error(r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&received)
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"unsupported resolution"}`))
	}))
	defer upstream.Close()
	a.Relay = relay.New(upstream.URL, "fixture-key")
	m := core.Model{ID: "override-video", Key: "grok-imagine-video", Name: "Grok", Kind: "video", Published: true, Available: true,
		Modes: []string{"t2v"}, Resolutions: []string{"720p"}, Ratios: []string{"16:9"}, Durations: []int{6, 15}, Points: 1,
		ParamsSchema: core.Data(map[string]any{"resolution_by_mode": map[string][]string{"t2v": {"720p"}}})}
	row, err := a.Store.Put(t.Context(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
	if err != nil {
		t.Fatal(err)
	}
	m.Settings = core.ModelSettings{Resolutions: []string{"4k", "720p"}, Ratios: []string{"21:9"}, Durations: []int{1, 6, 15, 30},
		PriceMatrix: map[string]map[string]float64{"1s": {"4k": 2.5}}}
	w := call(a, "PUT", "/api/admin/models/"+m.ID, admin, "", map[string]any{"version": row.Version, "data": m})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "GET", "/api/config", "", "", nil)
	var config struct {
		Models []core.Model `json:"models"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &config)
	found := false
	for _, model := range config.Models {
		if model.ID == m.ID {
			found = true
			if model.Resolutions[0] != "4k" || model.Durations[0] != 1 || model.Ratios[0] != "21:9" || len(model.ResolutionByMode) != 0 {
				t.Fatal(model)
			}
		}
	}
	if !found {
		t.Fatal("override model disappeared")
	}
	in := core.JobInput{Kind: "video", Model: m.ID, Prompt: "test", Resolution: "4k", Ratio: "21:9", Duration: 1}
	assertEstimate(t, a, user, in, 250, true)
	if _, err = a.Billing.Adjust(t.Context(), "user-a", "override-credit", "admin", "test", 1000); err != nil {
		t.Fatal(err)
	}
	approved := int64(250)
	in.ExpectedCostUnits = &approved
	w = call(a, "POST", "/api/jobs", user, "override-video-job", in)
	if w.Code != 202 {
		t.Fatal(w.Body.String())
	}
	j, err := a.Store.Claim(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	p := provider.Relay{Client: a.Relay, Store: a.Store, Assets: func(context.Context, core.Job) ([]core.Reference, error) { return nil, nil }}
	_, err = p.Generate(t.Context(), j)
	if err == nil || errors.Is(err, provider.ErrPending) || errors.Is(err, provider.ErrUncertain) {
		t.Fatal("relay rejection not final", err)
	}
	if received["duration"] != float64(1) || received["resolution"] != "4k" || received["ratio"] != "21:9" {
		t.Fatal("selected values changed", received)
	}
	if e := a.Store.Finish(t.Context(), j, "", err.Error()); e != nil {
		t.Fatal(e)
	}
	wallet, _ := a.Billing.Wallet(t.Context(), "user-a")
	if wallet.Available != 1000 || wallet.Held != 0 {
		t.Fatal("definite relay rejection did not refund", wallet)
	}
}
