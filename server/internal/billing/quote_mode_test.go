package billing

import (
	"doubo/server/internal/core"
	"testing"
)

// The create page labels a quote 按秒 only when the price came from the
// duration × resolution table; flat and per-request prices are 按次.
func TestQuoteDetailReportsPerSecondPricing(t *testing.T) {
	video := core.Model{Kind: "video", Points: 9, Resolutions: []string{"720p"}, Durations: []int{5, 10},
		Settings: core.ModelSettings{PriceMatrix: map[string]map[string]float64{"5s": {"720p": 35}}}}
	in := core.JobInput{Kind: "video", Resolution: "720p", Duration: 5}
	if units, perSecond, err := QuoteDetail(video, in); err != nil || units != 3500 || !perSecond {
		t.Fatal("duration table price not reported as 按秒", units, perSecond, err)
	}
	in.Duration = 10 // no table cell: flat model price
	if units, perSecond, _ := QuoteDetail(video, in); units != 900 || perSecond {
		t.Fatal("flat fallback reported as 按秒", units, perSecond)
	}
	video.Settings = core.ModelSettings{VideoBillingMode: "per_request", PricePerRequestByResolution: map[string]float64{"720p": 20}}
	if units, perSecond, _ := QuoteDetail(video, in); units != 2000 || perSecond {
		t.Fatal("per-request price reported as 按秒", units, perSecond)
	}
	image := core.Model{Kind: "image", Points: 2, Resolutions: []string{"1k"}, Settings: core.ModelSettings{PriceMatrix: map[string]map[string]float64{"default": {"1k": 4}}}}
	if units, perSecond, _ := QuoteDetail(image, core.JobInput{Kind: "image", Resolution: "1k"}); units != 400 || perSecond {
		t.Fatal("image priced 按秒", units, perSecond)
	}
}
