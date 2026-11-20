package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
)

func (p *Relay) chatHistory(ctx context.Context, j core.Job, body map[string]any) error {
	return chatHistory(ctx, p.Store, j, body)
}

const assistantSystem = "你是豆播的创作助手，帮助用户策划影像、编写脚本和生成提示词。"

// History is reconstructed from this user's successful jobs, never supplied
// by a client. An Agent project (SessionID) sees only its own turns, with its
// skill's instruction and material list; other agent chat sees the latest
// turns outside projects.
func chatHistory(ctx context.Context, s store.Store, j core.Job, body map[string]any) error {
	if j.Input.Purpose != "" && j.Input.Purpose != "agent" {
		return nil
	}
	system, keep := assistantSystem, 2000
	if j.Input.SessionID != "" {
		prompt, err := sessionSystem(ctx, s, j)
		if err != nil {
			return err
		}
		system, keep = prompt, 4000 // the last plan must reach the model whole
	}
	previous, err := recentTurns(ctx, s, j)
	if err != nil {
		return err
	}
	messages := []any{map[string]string{"role": "system", "content": system}}
	for _, old := range trimTurns(previous, keep) {
		messages = append(messages, map[string]string{"role": "user", "content": old.Input.Prompt}, map[string]string{"role": "assistant", "content": old.Result})
	}
	if current, ok := body["messages"].([]any); ok {
		messages = append(messages, current...)
	}
	body["messages"] = messages
	return nil
}

func sessionSystem(ctx context.Context, s store.Store, j core.Job) (string, error) {
	row, err := s.Get(ctx, "agent_sessions", j.Input.SessionID)
	if err != nil {
		return "", err
	}
	var session core.AgentSession
	if err = json.Unmarshal(row.Data, &session); err != nil {
		return "", err
	}
	skill, ok := core.AgentSkillByID(session.Skill)
	if !ok {
		skill, _ = core.AgentSkillByID("general")
	}
	counts := map[string]int{}
	for _, id := range session.Assets {
		if a, err := s.Get(ctx, "assets", id); err == nil && a.Owner == j.UserID {
			var v struct {
				Type string `json:"type"`
			}
			_ = json.Unmarshal(a.Data, &v)
			counts[strings.Split(v.Type, "/")[0]]++
		}
	}
	return core.AgentSystemPrompt(skill, counts), nil
}
