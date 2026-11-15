package api

import (
	"doubo/server/internal/core"
	"testing"
)

func TestLargePerSecondMatrixPriceMatchesEstimateAndFinalCharge(t *testing.T) {
	a, user, _ := setup(t)
	m := core.Model{ID: "per-second", Key: "fixture", Kind: "video", Published: true, Available: true, Points: 1,
		Modes: []string{"t2v"}, Resolutions: []string{"768p"}, Ratios: []string{"1:1"}, Durations: []int{30},
		Settings: core.ModelSettings{PriceMatrix: map[string]map[string]float64{"30s": {"768p": 2097262.2}}}}
	if _, err := a.Store.Put(t.Context(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0); err != nil {
		t.Fatal(err)
	}
	want := int64(209726220) // 69908.74 points/s × 30 seconds, in hundredths.
	in := core.JobInput{Kind: "video", Model: m.ID, Prompt: "test", Resolution: "768p", Ratio: "1:1", Duration: 30, ExpectedCostUnits: &want}
	assertEstimate(t, a, user, in, want, true)
	if _, err := a.Billing.Adjust(t.Context(), "user-a", "rate-credit", "admin", "test", want+100); err != nil {
		t.Fatal(err)
	}
	w := call(a, "POST", "/api/jobs", user, "rate-rounding-job", in)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	j, err := a.Store.Claim(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if err = a.Store.Finish(t.Context(), j, "https://example.test/video.mp4", ""); err != nil {
		t.Fatal(err)
	}
	wallet, err := a.Billing.Wallet(t.Context(), "user-a")
	if err != nil || wallet.Available != 100 || wallet.Held != 0 {
		t.Fatal("charged an extra fractional point", wallet, err)
	}
}
