package settings

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// DefaultFeedKeywords are the 创作 feed's chips until an operator sets
// HOT_FEED_KEYWORDS in the console or environment file. With keyword search (the
// default HOT_FEED_SOURCE) each chip is searched; with the hot list each
// filters it and "热门" shows all of it.
const DefaultFeedKeywords = "热门,剧情带货,探店,美食,好物推荐,穿搭,萌宠,旅行,家居"

const maxFeedKeywords = 12

// FeedKeywords splits the setting on commas (half or full width), 顿号 or
// line breaks, drops blanks and repeats, and keeps the order.
func FeedKeywords(value string) ([]string, error) {
	if strings.TrimSpace(value) == "" {
		value = DefaultFeedKeywords
	}
	parts := strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == '，' || r == '、' || r == '\n' || r == '\r' })
	seen, out := map[string]bool{}, []string{}
	for _, part := range parts {
		word := strings.TrimSpace(part)
		if word == "" || seen[word] {
			continue
		}
		if utf8.RuneCountInString(word) > 20 {
			return nil, errors.New("每个关键词不超过 20 字")
		}
		seen[word] = true
		out = append(out, word)
	}
	if len(out) > maxFeedKeywords {
		return nil, errors.New("创作页关键词最多 12 个")
	}
	return out, nil
}
