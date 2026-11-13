package core

import (
	"strings"
	"testing"
)

func TestPromptLimitsAndConfiguredText(t *testing.T) {
	for _, tc := range []struct {
		kind string
		want int
	}{{"image", 2000}, {"video", 20000}, {"chat", 500}, {"audio", 500}} {
		t.Run(tc.kind, func(t *testing.T) {
			m := Model{Kind: tc.kind}
			s := ModelSettings{}
			if s.PromptLimit(tc.kind) != tc.want {
				t.Fatal("wrong default", s.PromptLimit(tc.kind))
			}
			s.DefaultPrompt = strings.Repeat("景", tc.want)
			s.Ideas = []string{strings.Repeat("光", tc.want)}
			if err := s.Validate(m); err != nil {
				t.Fatal("default boundary rejected", err)
			}
			s.DefaultPrompt += "景"
			if s.Validate(m) == nil {
				t.Fatal("oversized default prompt accepted")
			}
			s.DefaultPrompt = ""
			s.Ideas[0] += "光"
			if s.Validate(m) == nil {
				t.Fatal("oversized inspiration accepted")
			}
		})
	}
	for _, kind := range []string{"image", "video"} {
		for _, limit := range []int{1, 500, 3000, 30000, 100000} {
			s := ModelSettings{MaxPromptChars: limit}
			if s.PromptLimit(kind) != limit || s.Validate(Model{Kind: kind}) != nil {
				t.Fatal("custom limit rejected", kind, limit)
			}
		}
		for _, limit := range []int{-1, 100001} {
			if (ModelSettings{MaxPromptChars: limit}).Validate(Model{Kind: kind}) == nil {
				t.Fatal("invalid limit accepted", kind, limit)
			}
		}
	}
	if (ModelSettings{MaxPromptChars: 5, Ideas: []string{"123456"}}).Validate(Model{Kind: "image"}) == nil {
		t.Fatal("inspiration ignored the configured limit")
	}
}
