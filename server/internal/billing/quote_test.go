package billing

import (
	"doubo/server/internal/core"
	"testing"
)

func TestExplicitFreeTierDoesNotFallBackToBasePrice(t *testing.T) {
	for _, kind := range []string{"image", "video"} {
		for _, mode := range []string{"duration", "per_request"} {
			t.Run(kind+"/"+mode, func(t *testing.T) {
				m := core.Model{Points: 25}
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
