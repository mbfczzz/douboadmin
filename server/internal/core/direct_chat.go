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

// Reply length cap sent to the provider per call and used for the hold
// (DeepSeek's chat models take at most 8K).
const DefaultMaxOutputTokens = 8192

// MaxPlanPromptChars is the longest plan prompt the Agent may write (one
// whole video prompt, as long as a video model takes by default).
const MaxPlanPromptChars = 20000

// ReplyTokenBudget bounds one Agent reply over all its calls: a plan with a
// 20,000-character prompt and its shots. A reply cut at the per-call cap
// goes on in the next call until it ends or this is spent.
const ReplyTokenBudget = 24576

func (s ModelSettings) OutputTokens() int {
	if s.MaxOutputTokens > 0 {
		return s.MaxOutputTokens
	}
	return DefaultMaxOutputTokens
}

// ReplyRounds is how many calls one reply may take (the first and its
// continuations).
func (s ModelSettings) ReplyRounds() int {
	out := s.OutputTokens()
	return min(max((ReplyTokenBudget+out-1)/out, 1), 6)
}
