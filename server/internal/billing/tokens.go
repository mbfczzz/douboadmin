package billing

import (
	"doubo/server/internal/core"
	"math"
	"time"
)

// Upper bounds for one chat turn. A token is at most one character for the
// Chinese and English the models see, so characters bound tokens from above.
const (
	// provider.trimTurns: earlier turns (8000) + system prompt and summary
	// (3000) + slack for labels and the summary instruction (1000).
	chatHistoryChars = 8000 + 3000 + 1000
	// provider.summarize: an earlier summary and the turns folded into it, and
	// the summary it writes (charged at the output price).
	SummaryInputChars = 12000
	SummaryOutput     = 600
	tokensPerImage    = 1500
)

// Tokens is one turn's usage; Cached is the part of Input the provider read
// from its cache (charged at the cache price).
type Tokens struct{ Input, Cached, Output int }

// ChatInputCap is the most input tokens one turn can send.
func ChatInputCap(in core.JobInput) int {
	n := len([]rune(in.Prompt)) + tokensPerImage*len(in.Assets)
	if in.Purpose == "" || in.Purpose == "agent" {
		n += chatHistoryChars
	}
	if in.SessionID != "" {
		n += SummaryInputChars
	}
	return n
}

// Peak reports DeepSeek's peak hours: Beijing time, Monday–Friday,
// 9:00–12:00 and 14:00–18:00 (public holidays are not known here and count
// as working days).
func Peak(at time.Time) bool {
	t := at.In(time.FixedZone("CST", 8*3600))
	if t.Weekday() == time.Saturday || t.Weekday() == time.Sunday {
		return false
	}
	h := t.Hour()
	return h >= 9 && h < 12 || h >= 14 && h < 18
}

func rate(s core.ModelSettings, peak bool) float64 {
	if peak && s.PeakPriceRate > 0 {
		return s.PeakPriceRate
	}
	return 1
}

// TokenPoints prices usage in points (prices are per 1,000 tokens).
func TokenPoints(s core.ModelSettings, t Tokens, peak bool) float64 {
	cached := s.TokenInputPrice
	if s.TokenCachedPrice != nil {
		cached = *s.TokenCachedPrice
	}
	hit := min(max(t.Cached, 0), t.Input)
	p := float64(t.Input-hit)*s.TokenInputPrice + float64(hit)*cached + float64(t.Output)*s.TokenOutputPrice
	return p * rate(s, peak) / 1000
}

// TokenUnits is the point units for actual usage, rounded up to 0.01.
func TokenUnits(s core.ModelSettings, t Tokens, peak bool) (int64, error) {
	p := TokenPoints(s, t, peak)
	return core.PointUnits(math.Ceil(p*float64(core.PointScale)-1e-9) / float64(core.PointScale))
}

// tokenHold is the most a turn can cost: nothing cached, the longest reply
// and summary, at the peak price (whenever it is sent).
func tokenHold(m core.Model, in core.JobInput) (int64, error) {
	s := m.Settings
	if s.TokenCachedPrice != nil && *s.TokenCachedPrice > s.TokenInputPrice {
		s.TokenInputPrice = *s.TokenCachedPrice
	}
	out := s.OutputTokens()
	if in.SessionID != "" {
		out += SummaryOutput
	}
	return TokenUnits(s, Tokens{Input: ChatInputCap(in), Output: out}, s.PeakPriceRate > 1)
}
