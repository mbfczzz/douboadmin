package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/llm"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A reply cut at the per-call cap goes on in the next call, joined without
// the part repeated at the seam, until it ends or the rounds are spent.
func TestLongRepliesGoOnWhereTheyWereCut(t *testing.T) {
	// Streamed as the providers do: text in pieces, then the finish and usage.
	reply := func(text, finish string, in, out int) string {
		event := func(v any) string { b, _ := json.Marshal(v); return "data: " + string(b) + "\n\n" }
		half := len([]rune(text)) / 2
		return event(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": string([]rune(text)[:half])}}}}) +
			event(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": string([]rune(text)[half:])}, "finish_reason": finish}}}) +
			event(map[string]any{"choices": []any{}, "usage": map[string]int{"prompt_tokens": in, "completion_tokens": out}}) + "data: [DONE]\n\n"
	}
	replies := []string{
		reply("好的：\n```plan\n{\"prompt\":\"第一段画面", "length", 100, 10),
		reply("\n\"prompt\":\"第一段画面，第二段画面", "length", 120, 10),
		reply("，第三段\"}\n```", "stop", 140, 5),
	}
	var bodies []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		bodies = append(bodies, body)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(replies[min(len(bodies), len(replies))-1]))
	}))
	defer server.Close()
	client := &llm.Client{BaseURL: server.URL, Key: "k"}
	messages := []any{map[string]string{"role": "user", "content": "写一个很长的方案"}}
	text, usage, err := client.Complete(context.Background(), "m", messages, 10, nil)
	if err != nil || !usage.Truncated {
		t.Fatal(err, usage)
	}
	seen := ""
	text, usage, err = continueReply(context.Background(), client, "m", messages, 10, 3, text, usage, func(s string) error { seen = s; return nil })
	want := "好的：\n```plan\n{\"prompt\":\"第一段画面，第二段画面，第三段\"}\n```"
	if err != nil || text != want || seen != want {
		t.Fatalf("%q\n%q %v", text, seen, err)
	}
	if usage.Input != 360 || usage.Output != 25 || usage.Truncated {
		t.Fatal(usage)
	}
	// The next call carries the reply so far and asks to go on.
	sent := bodies[1]["messages"].([]any)
	if len(sent) != 3 || sent[1].(map[string]any)["role"] != "assistant" || sent[2].(map[string]any)["content"] != continueAsk {
		t.Fatal(sent)
	}
	// Out of rounds: what was written stays, still marked as cut.
	bodies = nil
	text, usage, _ = client.Complete(context.Background(), "m", messages, 10, nil)
	text, usage, _ = continueReply(context.Background(), client, "m", messages, 10, 2, text, usage, nil)
	if !usage.Truncated || len(bodies) != 2 || !strings.HasSuffix(text, "第二段画面") {
		t.Fatal(len(bodies), usage, text)
	}
}

// The newest plan reaches the model whole (a revision builds on it) and is
// never the turn dropped for length; other replies stay capped.
func TestTheNewestLongPlanStaysWholeInHistory(t *testing.T) {
	long := "```plan\n{\"prompt\":\"" + strings.Repeat("镜", core.MaxPlanPromptChars) + "\"}\n```"
	other := strings.Repeat("说", 5000)
	out := trimTurns([]core.Job{turn("出方案", long), turn("问", other), turn("再问", other), turn("改一下", "好的")}, 4000)
	if len(out) < 2 || out[0].Result != long {
		t.Fatalf("plan lost or cut: %d turns, first %d runes", len(out), len([]rune(out[0].Result)))
	}
	for _, o := range out[1:] {
		if len([]rune(o.Result)) > 4000 {
			t.Fatal("another reply not capped")
		}
	}
	if out[len(out)-1].Result != "好的" {
		t.Fatal("the newest turn was dropped")
	}
}

func TestReplyRoundsCoverALongPlan(t *testing.T) {
	for out, want := range map[int]int{0: 3, 8192: 3, 4096: 6, 1000: 6, 32768: 1} {
		if got := (core.ModelSettings{MaxOutputTokens: out}).ReplyRounds(); got != want {
			t.Fatal(out, got)
		}
	}
	if !strings.Contains(core.AgentSystemPrompt(core.AgentSkills[0], nil), "最长 20000 字") {
		t.Fatal("the Agent is not told the plan may be long")
	}
}
