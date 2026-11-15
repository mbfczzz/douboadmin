package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestModelPricingPriorityMatchesEstimateReservationAndCharge(t *testing.T) {
	for _, name := range []string{"no-tiers", "legacy-case", "retired-resolution", "retired-quality", "quality-only", "missing-tier", "image-price", "fixed-quality-price", "free-tier", "video-request", "video-missing", "video-duration"} {
		t.Run(name, func(t *testing.T) {
			a, user, _ := setup(t)
			m := core.Model{ID: "price-fallback", Key: "price-test", Name: "定价测试", Kind: "image",
				Published: true, Available: true, Points: 7.5, Modes: []string{"t2i"}}
			in := core.JobInput{Kind: "image", Model: m.ID, Prompt: "test"}
			want := int64(750)
			switch name {
			case "legacy-case":
				m.Resolutions, m.Qualities, in.Resolution, in.Quality = []string{"1K"}, []string{"HIGH"}, "1K", "HIGH"
				m.Settings.PriceMatrix = map[string]map[string]float64{"HIGH": {"1K": 2.25}}
				want = 225
			case "retired-resolution":
				in.Resolution = "1k" // A stale client still submits the retired tier.
				m.Settings.PriceMatrix = map[string]map[string]float64{"default": {"1k": 0}}
			case "retired-quality":
				m.Resolutions, in.Resolution, in.Quality = []string{"1k"}, "1k", "high"
				m.Settings.PriceMatrix = map[string]map[string]float64{"high": {"1k": 0}, "default": {"1k": 3.25}}
				want = 325
			case "quality-only":
				m.Qualities, in.Quality = []string{"low", "high"}, "high"
			case "missing-tier", "image-price", "free-tier":
				m.Resolutions, m.Qualities = []string{"1k", "2k"}, []string{"low", "high"}
				m.Settings.PriceMatrix = map[string]map[string]float64{"low": {"1k": 2.25, "2k": 0}}
				in.Resolution, in.Quality = "1k", "high"
				if name == "image-price" {
					in.Quality, want = "low", 225
				}
				if name == "free-tier" {
					in.Quality, in.Resolution, want = "low", "2k", 0
				}
			case "fixed-quality-price":
				m.Resolutions, in.Resolution = []string{"1k"}, "1k"
				m.Settings.PriceMatrix = map[string]map[string]float64{"default": {"1k": 3.25}}
				want = 325
			case "video-request", "video-missing", "video-duration":
				m.Kind, in.Kind, m.Modes = "video", "video", []string{"t2v"}
				m.Resolutions, m.Durations = []string{"720p", "1080p"}, []int{5, 10}
				in.Resolution, in.Duration = "720p", 10
				m.Settings.VideoBillingMode = "per_request"
				m.Settings.PricePerRequestByResolution = map[string]float64{"720p": 6}
				want = 600
				if name == "video-missing" {
					in.Resolution, want = "1080p", 750
				}
				if name == "video-duration" {
					m.Settings.VideoBillingMode = "duration"
					m.Settings.PriceMatrix = map[string]map[string]float64{"10s": {"720p": 8.25}}
					want = 825
				}
			}
			row, err := a.Store.Put(t.Context(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
			if err != nil {
				t.Fatal(err)
			}
			assertEstimate(t, a, user, in, want, true)
			if _, err = a.Billing.Adjust(t.Context(), "user-a", "pricing-funds", "admin", "测试定价", 10000); err != nil {
				t.Fatal(err)
			}
			in.ExpectedCostUnits = &want
			w := call(a, "POST", "/api/jobs", user, "pricing-priority-job", in)
			var job core.Job
			if w.Code != 202 || json.Unmarshal(w.Body.Bytes(), &job) != nil || job.CostUnits != want {
				t.Fatal("submission price differs from estimate", w.Code, w.Body.String())
			}
			wallet, _ := a.Billing.Wallet(t.Context(), "user-a")
			if wallet.Available != 10000-want || wallet.Held != want {
				t.Fatal("incorrect reserved price", wallet)
			}
			// A later price edit must not change the already-approved task's charge.
			m.Points, m.Settings.PriceMatrix, m.Settings.PricePerRequestByResolution = 99, nil, nil
			row.Data = core.Data(m)
			if _, err = a.Store.Put(t.Context(), "models", row, row.Version); err != nil {
				t.Fatal(err)
			}
			claimed, err := a.Store.Claim(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			if err = a.Store.Finish(t.Context(), claimed, "https://example.test/result.png", ""); err != nil {
				t.Fatal(err)
			}
			wallet, _ = a.Billing.Wallet(t.Context(), "user-a")
			if wallet.Available != 10000-want || wallet.Held != 0 {
				t.Fatal("final charge differs from estimate", wallet)
			}
		})
	}
}
