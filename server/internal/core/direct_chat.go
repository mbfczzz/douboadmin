package core

import "strings"

// Chat models called directly at their provider rather than through the
// relay carry a "provider:model" key, e.g. "deepseek:deepseek-chat" or
// "ark:doubao-seed-2-1-lite-260915". Relay keys never contain these prefixes.
var DirectChatProviders = []string{"deepseek", "ark"}

func DirectChat(key string) (provider, model string, ok bool) {
	provider, model, ok = strings.Cut(key, ":")
	if !ok || model == "" {
		return "", "", false
	}
	for _, p := range DirectChatProviders {
		if p == provider {
			return provider, model, true
		}
	}
	return "", "", false
}

// TokenPriced: chat priced per 1,000 tokens (按量). Points are held for the
// largest possible reply and settled on what the provider reports.
func (s ModelSettings) TokenPriced() bool {
	return s.TokenInputPrice > 0 || s.TokenOutputPrice > 0
}

// Reply length cap sent to the provider and used for the hold.
const DefaultMaxOutputTokens = 4096

func (s ModelSettings) OutputTokens() int {
	if s.MaxOutputTokens > 0 {
		return s.MaxOutputTokens
	}
	return DefaultMaxOutputTokens
}
