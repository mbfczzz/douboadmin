package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
)

func (p *Relay) chatHistory(ctx context.Context, j core.Job, body map[string]any) error {
	return chatHistory(ctx, p.Store, j, body, nil)
}

const assistantSystem = "你是豆播的创作助手，帮助用户策划影像、编写脚本和生成提示词。"

// Summarizer condenses earlier turns (see summarize); nil keeps only the
// latest turns.
type Summarizer func(ctx context.Context, text string) (string, error)

// History is reconstructed from this user's successful jobs, never supplied
// by a client. An Agent project (SessionID) sees only its own turns, with its
// skill's instruction, material list and a summary of turns too old to send;
// other agent chat sees the latest turns outside projects.
func chatHistory(ctx context.Context, s store.Store, j core.Job, body map[string]any, summarize Summarizer) error {
	if j.Input.Purpose != "" && j.Input.Purpose != "agent" {
		return nil
	}
	system, keep := assistantSystem, 2000
	var session *sessionRow
	if j.Input.SessionID != "" {
		var err error
		if session, err = loadSession(ctx, s, j); err != nil {
			return err
		}
		system, keep = sessionSystem(ctx, s, j, session.AgentSession), 4000 // the last plan must reach the model whole
	}
	turns, err := recentTurns(ctx, s, j)
	if err != nil {
		return err
	}
	if session != nil {
		turns = foldTurns(ctx, s, session, turns, summarize)
		if session.Summary != "" {
			system += "\n此前对话摘要（更早的轮次已不再提供原文）：\n" + session.Summary
		}
	}
	if len(turns) > historyTurns+2 {
		turns = turns[len(turns)-historyTurns:]
	}
	messages := []any{map[string]string{"role": "system", "content": system}}
	for _, old := range trimTurns(turns, keep) {
		messages = append(messages, map[string]string{"role": "user", "content": old.Input.Prompt}, map[string]string{"role": "assistant", "content": old.Result})
	}
	if current, ok := body["messages"].([]any); ok {
		messages = append(messages, current...)
	}
	body["messages"] = messages
	return nil
}

type sessionRow struct {
	core.AgentSession
	row core.Record
}

func loadSession(ctx context.Context, s store.Store, j core.Job) (*sessionRow, error) {
	row, err := s.Get(ctx, "agent_sessions", j.Input.SessionID)
	if err != nil {
		return nil, err
	}
	out := &sessionRow{row: row}
	return out, json.Unmarshal(row.Data, &out.AgentSession)
}

func sessionSystem(ctx context.Context, s store.Store, j core.Job, session core.AgentSession) string {
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
	return core.AgentSystemPrompt(skill, counts)
}
