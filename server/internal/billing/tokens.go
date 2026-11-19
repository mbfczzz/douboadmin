package billing

import (
	"doubo/server/internal/core"
	"math"
)

// Upper bounds for one chat turn. A token is at most one character for the
// Chinese and English the models see, so characters bound tokens from above.
const (
	chatHistoryChars = 6*(500+2000) + 200 // provider.chatHistory: 6 turns + system prompt
	tokensPerImage   = 1500
)

// ChatInputCap is the most input tokens one turn can send.
func ChatInputCap(in core.JobInput) int {
	n := len([]rune(in.Prompt)) + tokensPerImage*len(in.Assets)
	if in.Purpose == "" || in.Purpose == "agent" {
		n += chatHistoryChars
	}
	return n
}

// TokenPoints prices a token count in points (per 1,000 tokens).
func TokenPoints(s core.ModelSettings, input, output int) float64 {
	return (float64(input)*s.TokenInputPrice + float64(output)*s.TokenOutputPrice) / 1000
}

// TokenUnits is the point units for actual usage, rounded up to 0.01.
func TokenUnits(s core.ModelSettings, input, output int) (int64, error) {
	p := TokenPoints(s, input, output)
	return core.PointUnits(math.Ceil(p*float64(core.PointScale)-1e-9) / float64(core.PointScale))
}

func tokenHold(m core.Model, in core.JobInput) (int64, error) {
	return TokenUnits(m.Settings, ChatInputCap(in), m.Settings.OutputTokens())
}
