package provider

import (
	"context"
	"doubo/server/internal/llm"
	"strings"
)

// continueAsk asks the model to go on exactly where its reply was cut.
const continueAsk = "你的上一条回复因长度限制被截断了。请从截断处直接接着往下写：不要重复已写的内容，不要加任何说明，不要重新开始代码块。"

// continueReply carries on a reply cut at the per-call cap, in up to rounds
// calls in all, so one reply can hold a long plan (a 20,000-character
// prompt). Each call sends the conversation, the reply so far and
// continueAsk; text repeated at the joint is dropped. onText sees the whole
// reply as it grows.
func continueReply(ctx context.Context, client *llm.Client, key string, messages []any, maxTokens, rounds int,
	text string, usage llm.Usage, onText func(string) error) (string, llm.Usage, error) {
	for round := 1; usage.Truncated && round < rounds; round++ {
		more := append(append([]any{}, messages...),
			map[string]string{"role": "assistant", "content": text},
			map[string]string{"role": "user", "content": continueAsk})
		before := text
		next, u, err := client.Complete(ctx, key, more, maxTokens, func(part string) error {
			if onText == nil {
				return nil
			}
			return onText(join(before, part))
		})
		usage.Input, usage.Cached, usage.Output = usage.Input+u.Input, usage.Cached+u.Cached, usage.Output+u.Output
		usage.Truncated = u.Truncated
		if err != nil {
			return text, usage, err
		}
		text = join(before, next)
	}
	return text, usage, nil
}

// join appends the continuation, without the part of it that repeats the
// end of the text so far (up to 200 characters).
func join(text, next string) string {
	a, b := []rune(text), []rune(next)
	for n := min(len(a), len(b), 200); n >= 8; n-- {
		if string(a[len(a)-n:]) == string(b[:n]) {
			return text + string(b[n:])
		}
	}
	return text + strings.TrimLeft(next, "\n")
}
