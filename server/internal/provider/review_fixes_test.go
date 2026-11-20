package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"doubo/server/internal/vision"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// A stopped reply is estimated from what was said, not JSON or picture URLs.
func TestEstimatesCountContentOnly(t *testing.T) {
	msgs := []any{
		map[string]string{"role": "system", "content": "你好"},
		map[string]any{"role": "user", "content": []any{map[string]string{"type": "text", "text": "看图"}, map[string]any{"type": "image_url", "image_url": map[string]string{"url": strings.Repeat("x", 900)}}}},
	}
	if n := estimateTokens(msgs); n != 2+2+1500 {
		t.Fatal(n)
	}
}

// Folding keeps every folded turn in the summary input (each reply capped).
func TestSummaryInputKeepsEveryFoldedTurn(t *testing.T) {
	long := strings.Repeat("长", 3000)
	turns := []core.Job{turn("第1问", long), turn("第2问", long), turn("第3问", long), turn("第4问", long)}
	if in := summaryInput("", trim(turns, 2000, 0)); !strings.Contains(in, "第1问") || !strings.Contains(in, "第4问") {
		t.Fatal("a folded turn went missing")
	}
}

// Plain chat (outside projects) finds its turns even after many project turns.
func TestPlainChatHistoryIgnoresProjectTurns(t *testing.T) {
	s := store.NewMemory()
	ctx := t.Context()
	at := time.Now().UTC().Add(-2 * time.Hour)
	add := func(session, prompt string) {
		j := core.NewJob("u", core.NewID(), core.JobInput{Kind: "chat", Prompt: prompt, Purpose: "agent", SessionID: session, Assets: []string{}})
		j.CreatedAt, at = at, at.Add(time.Minute)
		_, _ = s.CreateJob(ctx, j)
		c, _ := s.Claim(ctx)
		_ = s.Finish(ctx, c, "答", "")
	}
	add("", "项目外的那一问")
	for i := 0; i < 35; i++ {
		add("proj", fmt.Sprintf("项目里第%d问", i))
	}
	now := core.NewJob("u", "now", core.JobInput{Kind: "chat", Prompt: "继续", Purpose: "agent"})
	body := map[string]any{"messages": []any{}}
	if err := chatHistory(ctx, s, now, body, nil); err != nil {
		t.Fatal(err)
	}
	msgs := body["messages"].([]any)
	if len(msgs) != 3 || msgs[1].(map[string]string)["content"] != "项目外的那一问" {
		t.Fatal(msgs)
	}
}

// After the 视频理解 model changes, the new note replaces the old one (and
// the video is not watched again on every turn).
func TestVideoNoteIsReplacedForANewModel(t *testing.T) {
	_, p, j, _ := directFixture(t, `{}`, 200)
	watches := 0
	eye := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		watches++
		_, _ = io.WriteString(w, watched)
	}))
	defer eye.Close()
	_, _ = p.Store.Put(t.Context(), "assets", core.Record{ID: "v1", Owner: "u", Data: core.Data(map[string]any{"type": "video/mp4", "size": 1})}, 0)
	p.Vision = &vision.Client{BaseURL: eye.URL, Key: "k", Model: "old"}
	p.videoNote(t.Context(), j, "v1", "https://x/v.mp4")
	p.Vision.Model = "new"
	p.videoNote(context.Background(), j, "v1", "https://x/v.mp4")
	p.videoNote(context.Background(), j, "v1", "https://x/v.mp4")
	if watches != 2 {
		t.Fatal("watched", watches, "times")
	}
}
