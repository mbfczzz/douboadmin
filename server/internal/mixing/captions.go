package mixing

import (
	"fmt"
	"math"
	"strings"
	"unicode"
)

type Caption struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
}

func captionTime(seconds float64) string {
	n := int(math.Max(0, seconds) * 1000)
	return fmt.Sprintf("%02d:%02d:%02d,%03d", n/3600000, n/60000%60, n/1000%60, n%1000)
}
func Subtitle(segments []Caption) string {
	var out strings.Builder
	for i, s := range segments {
		if s.End <= s.Start {
			continue
		}
		text := strings.Map(func(r rune) rune {
			if r == '\r' || r == '\n' || r == '{' || r == '}' {
				return ' '
			}
			return r
		}, s.Text)
		fmt.Fprintf(&out, "%d\n%s --> %s\n%s\n\n", i+1, captionTime(s.Start), captionTime(s.End), text)
	}
	return out.String()
}

// When the ASR service supplies no timestamps, evenly paced captions are explicitly estimated.
func CaptionText(text string, duration float64) []Caption {
	parts := []string{}
	var line []rune
	for _, r := range []rune(text) {
		if !unicode.IsSpace(r) {
			line = append(line, r)
		}
		if len(line) >= 20 || strings.ContainsRune("。！？；.!?;", r) {
			if len(line) > 0 {
				parts = append(parts, string(line))
				line = nil
			}
		}
	}
	if len(line) > 0 {
		parts = append(parts, string(line))
	}
	total := 0
	for _, p := range parts {
		total += len([]rune(p))
	}
	if total == 0 {
		return []Caption{}
	}
	out := []Caption{}
	start := 0.0
	for _, p := range parts {
		end := start + duration*float64(len([]rune(p)))/float64(total)
		out = append(out, Caption{Start: start, End: end, Text: p})
		start = end
	}
	return out
}
