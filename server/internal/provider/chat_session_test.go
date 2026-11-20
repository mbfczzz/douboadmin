package provider

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
	"testing"
	"time"
)

// A project's turns see only that project, with its skill and materials.
func TestProjectHistoryIsScopedAndCarriesSkillAndMaterials(t *testing.T) {
	s := store.NewMemory()
	ctx := t.Context()
	_, _ = s.Put(ctx, "assets", core.Record{ID: "p1", Owner: "u", Data: core.Data(map[string]any{"type": "image/jpeg"})}, 0)
	_, _ = s.Put(ctx, "assets", core.Record{ID: "v1", Owner: "u", Data: core.Data(map[string]any{"type": "video/mp4"})}, 0)
	_, _ = s.Put(ctx, "agent_sessions", core.Record{ID: "proj", Owner: "u", Data: core.Data(core.AgentSession{Skill: "store", Assets: []string{"p1", "v1"}})}, 0)
	at := time.Now().UTC().Add(-time.Hour)
	add := func(session, prompt string) {
		j := core.NewJob("u", core.NewID(), core.JobInput{Kind: "chat", Prompt: prompt, Purpose: "agent", SessionID: session, Assets: []string{}})
		j.CreatedAt, at = at, at.Add(time.Minute)
		_, _ = s.CreateJob(ctx, j)
		c, _ := s.Claim(ctx)
		_ = s.Finish(ctx, c, "回复："+prompt, "")
	}
	add("proj", "第一版方案")
	add("", "项目外的聊天")
	add("other", "别的项目")
	now := core.NewJob("u", "now", core.JobInput{Kind: "chat", Prompt: "改第二镜", Purpose: "agent", SessionID: "proj"})
	body := map[string]any{"messages": []any{map[string]any{"role": "user", "content": "改第二镜"}}}
	if err := chatHistory(ctx, s, now, body, nil); err != nil {
		t.Fatal(err)
	}
	msgs := body["messages"].([]any)
	system := msgs[0].(map[string]string)["content"]
	if !strings.Contains(system, "```plan") || !strings.Contains(system, "探店视频") || !strings.Contains(system, "本项目素材：图片1、视频1") {
		t.Fatal(system)
	}
	if len(msgs) != 4 || msgs[1].(map[string]string)["content"] != "第一版方案" {
		t.Fatal("history should hold only this project's turn", msgs)
	}
}
