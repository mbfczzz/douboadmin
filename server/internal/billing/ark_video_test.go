package billing

import (
	"doubo/server/internal/core"
	"testing"
)

func seedance() core.Model {
	return core.Model{Key: core.ArkVideoPrefix + "doubao-seedance-2-0-260128", Kind: "video",
		Settings: core.ModelSettings{VideoTokenPrices: map[string]core.VideoTokenPrice{"720p": {Plain: 460, WithVideo: 280}}}}
}

// The hold is the documented token estimate with slack; usage is priced at
// the rate for the output resolution, lower when a video was input.
func TestArkVideoHoldAndUsage(t *testing.T) {
	m, in := seedance(), core.JobInput{Kind: "video", Resolution: "720p", Ratio: "16:9", Duration: 5}
	// 5 s × 1280 × 720 × 24 / 1024 = 108,000 tokens; × 1.15 = 124,200; × 460 / 1e6 = 57.132 → 57.14.
	if units, perSecond, err := QuoteDetail(m, in); err != nil || units != 5714 || perSecond {
		t.Fatal(units, perSecond, err)
	}
	// A 10 s reference video: (5 + 10) s, at the with-video price 280.
	if units, err := ArkVideoHold(m, in, []float64{10}); err != nil || units != 10433 { // 324,000 × 1.15 = 372,600 × 280 / 1e6 = 104.328 → 104.33
		t.Fatal(units, err)
	}
	// The official example: 108,900 tokens → 50.094 → 50.10 points (≈ ¥5.01).
	if units, err := ArkVideoUnits(m, in, 108900, false); err != nil || units != 5010 {
		t.Fatal(units, err)
	}
	if units, _ := ArkVideoUnits(m, in, 108900, true); units != 3050 { // 30.492 → 30.50
		t.Fatal(units)
	}
	in.Mode = "i2v" // follows the picture: the largest 720p frame (4:3, 1112 × 834)
	if got := ArkVideoTokens(in, nil); got != 5*1112*834*24.0/1024 {
		t.Fatal(got)
	}
	in.Resolution = "1080p"
	if _, err := ArkVideoUnits(m, in, 1000, false); err == nil {
		t.Fatal("a resolution without a price was charged")
	}
}
