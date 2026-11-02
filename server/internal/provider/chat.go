package provider

import (
	"context"
	"doubo/server/internal/core"
	"slices"
)

// History is reconstructed from this user's successful jobs, never supplied by a client.
func (p *Relay) chatHistory(ctx context.Context, j core.Job, body map[string]any) error {
	if j.Input.Purpose != "" && j.Input.Purpose != "agent" {
		return nil
	}
	jobs, err := p.Store.Jobs(ctx, j.UserID)
	if err != nil {
		return err
	}
	previous := []core.Job{}
	for _, old := range jobs {
		if old.Input.Kind == "chat" && old.Status == "succeeded" && old.CreatedAt.Before(j.CreatedAt) {
			previous = append(previous, old)
			if len(previous) == 6 {
				break
			}
		}
	}
	slices.Reverse(previous)
	messages := []any{map[string]string{"role": "system", "content": "你是豆播的创作助手，帮助用户策划影像、编写脚本和生成提示词。"}}
	for _, old := range previous {
		text := []rune(old.Result)
		if len(text) > 2000 {
			text = text[:2000]
		}
		messages = append(messages, map[string]string{"role": "user", "content": old.Input.Prompt}, map[string]string{"role": "assistant", "content": string(text)})
	}
	if current, ok := body["messages"].([]any); ok {
		messages = append(messages, current...)
	}
	body["messages"] = messages
	return nil
}
