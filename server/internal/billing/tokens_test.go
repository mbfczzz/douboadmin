package billing

import (
	"doubo/server/internal/core"
	"testing"
	"time"
)

// Cache hits are charged at the cache price; peak hours multiply all prices.
func TestTokenPricesFollowCacheAndPeak(t *testing.T) {
	hit := 0.0002
	s := core.ModelSettings{TokenInputPrice: 0.01, TokenOutputPrice: 0.04, TokenCachedPrice: &hit, PeakPriceRate: 2}
	use := Tokens{Input: 100000, Cached: 60000, Output: 10000}
	// (40000×0.01 + 60000×0.0002 + 10000×0.04) / 1000 = 0.812 → 0.82
	if u, _ := TokenUnits(s, use, false); u != units(0.82) {
		t.Fatal(u)
	}
	if u, _ := TokenUnits(s, use, true); u != units(1.63) { // 1.624 → 1.63
		t.Fatal(u)
	}
	s.TokenCachedPrice = nil // unset: cached input costs the input price
	if p := TokenPoints(s, use, false); p < 1.39 || p > 1.41 {
		t.Fatal(p)
	}
}

func units(p float64) int64 { u, _ := core.PointUnits(p); return u }

func TestPeakHoursAreBeijingWorkdayHours(t *testing.T) {
	cst := time.FixedZone("CST", 8*3600)
	for at, want := range map[time.Time]bool{
		time.Date(2026, 11, 20, 9, 0, 0, 0, cst):      true,  // Friday
		time.Date(2026, 11, 20, 12, 30, 0, 0, cst):    false, // lunch
		time.Date(2026, 11, 20, 17, 59, 0, 0, cst):    true,
		time.Date(2026, 11, 20, 18, 0, 0, 0, cst):     false,
		time.Date(2026, 11, 21, 10, 0, 0, 0, cst):     false, // Saturday
		time.Date(2026, 11, 20, 2, 0, 0, 0, time.UTC): true,  // 10:00 in Beijing
	} {
		if Peak(at) != want {
			t.Fatal(at, want)
		}
	}
}

// A model that watches videos holds room for a video per material.
func TestVideoWatchingModelsHoldMore(t *testing.T) {
	in := core.JobInput{Kind: "chat", Prompt: "看视频", Assets: []string{"v1"}, Purpose: "agent"}
	s := core.ModelSettings{TokenInputPrice: 0.008, TokenOutputPrice: 0.02}
	seeing, _ := tokenHold(core.Model{Settings: s, ReferenceTypes: []string{"image"}}, in)
	watching, _ := tokenHold(core.Model{Settings: s, ReferenceTypes: []string{"image", "video"}}, in)
	if watching <= seeing {
		t.Fatal(seeing, watching)
	}
}
