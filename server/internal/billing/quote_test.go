package billing

import (
	"doubo/server/internal/core"
	"testing"
)

func TestExplicitFreeTierDoesNotFallBackToBasePrice(t *testing.T) {
	for _, kind := range []string{"image", "video"} {
		for _, mode := range []string{"duration", "per_request"} {
			t.Run(kind+"/"+mode, func(t *testing.T) {
				m := core.Model{Points: 25, Resolutions: []string{"1k", "2k"}, Durations: []int{5}}
				m.Settings.VideoBillingMode = mode
				m.Settings.PriceMatrix = map[string]map[string]float64{"default": {"1k": 0}, "5s": {"1k": 0}}
				m.Settings.PricePerRequestByResolution = map[string]float64{"1k": 0}
				in := core.JobInput{Kind: kind, Duration: 5, Resolution: "1k"}
				price, e := Quote(m, in)
				if e != nil || price != 0 {
					t.Fatalf("free tier charged %d: %v", price, e)
				}
				in.Resolution = "2k"
				price, e = Quote(m, in)
				if e != nil || price != 2500 {
					t.Fatalf("missing tier lost base price: %d, %v", price, e)
				}
			})
		}
	}
}

func TestHiddenPricingDimensionsDoNotUseInvisibleTierPrices(t *testing.T) {
	m := core.Model{Points: 1, Resolutions: []string{"1k"}, Qualities: []string{"low"}, Durations: []int{5}, Settings: core.ModelSettings{
		HideResolution: true, HideQuality: true,
		PriceMatrix:                 map[string]map[string]float64{"low": {"1k": 4}, "default": {"1k": 1.25}, "5s": {"1k": 6}},
		PricePerRequestByResolution: map[string]float64{"1k": 9},
	}}
	check := func(in core.JobInput, want int64) {
		t.Helper()
		got, err := Quote(m, in)
		if err != nil || got != want {
			t.Fatalf("got %d, want %d: %v", got, want, err)
		}
	}
	in := core.JobInput{Kind: "image", Quality: "low", Resolution: "1k", Duration: 5}
	check(in, 100) // No visible matrix: base points, not the retained 4-point tier.
	m.Settings.HideResolution = false
	check(in, 125) // Only quality hidden: the visible default-quality row applies.
	delete(m.Settings.PriceMatrix, "default")
	check(in, 100) // Missing default row must not fall through to quality "low".
	m.Settings.PriceMatrix["default"] = map[string]float64{"1k": 0}
	check(in, 0)
	m.Settings.HideQuality = false
	check(in, 400) // Re-enabling the dimension restores its retained price.
	in.Kind = "video"
	for _, mode := range []string{"duration", "per_request"} {
		m.Settings.VideoBillingMode = mode
		m.Settings.HideResolution = true
		check(in, 100)
		m.Settings.HideResolution = false
		want := int64(600)
		if mode == "per_request" {
			want = 900
		}
		check(in, want)
	}
}
