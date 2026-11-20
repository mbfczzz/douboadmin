package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func projectTurns(t *testing.T, n int) (*store.Memory, core.Job) {
	t.Helper()
	s := store.NewMemory()
	ctx := t.Context()
	_, _ = s.Put(ctx, "agent_sessions", core.Record{ID: "proj", Owner: "u", Data: core.Data(core.AgentSession{Skill: "store", Assets: []string{}})}, 0)
	at := time.Now().UTC().Add(-time.Hour)
	for i := 1; i <= n; i++ {
		j := core.NewJob("u", core.NewID(), core.JobInput{Kind: "chat", Prompt: fmt.Sprintf("第%d问", i), Purpose: "agent", SessionID: "proj", Assets: []string{}})
		j.CreatedAt, at = at, at.Add(time.Minute)
		_, _ = s.CreateJob(ctx, j)
		c, _ := s.Claim(ctx)
		_ = s.Finish(ctx, c, fmt.Sprintf("第%d答", i), "")
	}
	return s, core.NewJob("u", "now", core.JobInput{Kind: "chat", Prompt: "继续", Purpose: "agent", SessionID: "proj"})
}

func history(t *testing.T, s store.Store, j core.Job, sum Summarizer) []any {
	t.Helper()
	body := map[string]any{"messages": []any{}}
	if err := chatHistory(t.Context(), s, j, body, sum); err != nil {
		t.Fatal(err)
	}
	return body["messages"].([]any)
}

// Past 8 turns, all but the last 4 are folded into a summary that is kept
// on the project; the next turns build on it instead of resending them.
func TestLongProjectsAreSummarized(t *testing.T) {
	s, now := projectTurns(t, 9)
	var asked []string
	sum := func(_ context.Context, text string) (string, error) {
		asked = append(asked, text)
		return "用户要竖屏探店，已定开场推门", nil
	}
	msgs := history(t, s, now, sum)
	if len(asked) != 1 || !strings.Contains(asked[0], "用户：第1问\n助手：第1答") || strings.Contains(asked[0], "第6问") {
		t.Fatal(asked)
	}
	if system := msgs[0].(map[string]string)["content"]; !strings.Contains(system, "此前对话摘要") || !strings.Contains(system, "已定开场推门") {
		t.Fatal(system)
	}
	if len(msgs) != 1+2*4 || msgs[1].(map[string]string)["content"] != "第6问" {
		t.Fatal(len(msgs), msgs[1])
	}
	row, _ := s.Get(t.Context(), "agent_sessions", "proj")
	var session core.AgentSession
	_ = json.Unmarshal(row.Data, &session)
	if session.Summary != "用户要竖屏探店，已定开场推门" || session.SummaryUntil == 0 {
		t.Fatal(session)
	}
	// The next turn: 4 turns since the summary, nothing to fold.
	if msgs = history(t, s, now, sum); len(asked) != 1 || len(msgs) != 1+2*4 {
		t.Fatal(len(asked), len(msgs))
	}
}

// Short projects are not summarized; a failed summary sends the latest turns.
func TestSummaryOnlyWhenNeeded(t *testing.T) {
	s, now := projectTurns(t, 8)
	calls := 0
	sum := func(context.Context, string) (string, error) { calls++; return "", errors.New("down") }
	if msgs := history(t, s, now, sum); calls != 0 || len(msgs) != 1+2*8 {
		t.Fatal(calls, len(msgs))
	}
	s, now = projectTurns(t, 12)
	if msgs := history(t, s, now, sum); calls != 1 || len(msgs) != 1+2*historyTurns {
		t.Fatal(calls, len(msgs))
	}
}
