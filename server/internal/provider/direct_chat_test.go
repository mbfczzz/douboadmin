package provider

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/llm"
	"doubo/server/internal/store"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// A chat turn on a token-priced DeepSeek model: hold the most it can cost,
// charge what the provider reports, return the rest.
func directFixture(t *testing.T, reply string, status int) (*store.Memory, *DirectChat, core.Job, *[]map[string]any) {
	t.Helper()
	bodies := &[]map[string]any{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" || r.Header.Get("Authorization") != "Bearer key" {
			t.Errorf("request %s %s", r.URL.Path, r.Header.Get("Authorization"))
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		*bodies = append(*bodies, body)
		w.WriteHeader(status)
		_, _ = io.WriteString(w, reply)
	}))
	t.Cleanup(srv.Close)
	s := store.NewMemory()
	ctx := t.Context()
	m := core.Model{ID: "ds", Key: "deepseek:deepseek-chat", Name: "DeepSeek", Kind: "chat", Published: true, Available: true,
		Settings: core.ModelSettings{TokenInputPrice: 1, TokenOutputPrice: 2, MaxOutputTokens: 1000}}
	if _, err := s.Put(ctx, "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0); err != nil {
		t.Fatal(err)
	}
	if err := s.Atomic(ctx, func(tx store.Transaction) error {
		_, e := store.ApplyFunds(tx, core.LedgerEntry{UserID: "u", Reference: "seed", Kind: "admin_adjust", AvailableDelta: 100000})
		return e
	}); err != nil {
		t.Fatal(err)
	}
	in := core.JobInput{Kind: "chat", Model: "ds", Prompt: "写一段咖啡店脚本", Purpose: "agent", Assets: []string{}}
	units, _, err := billing.QuoteDetail(m, in)
	if err != nil {
		t.Fatal(err)
	}
	j := core.NewJob("u", core.NewID(), in)
	j.CostUnits = units
	if _, err = s.CreateJob(ctx, j); err != nil {
		t.Fatal(err)
	}
	if j, err = s.Claim(ctx); err != nil {
		t.Fatal(err)
	}
	p := &DirectChat{Clients: map[string]*llm.Client{"deepseek": {BaseURL: srv.URL, Key: "key"}}, Store: s,
		Assets: func(context.Context, core.Job) ([]core.Reference, error) {
			return []core.Reference{{URL: "https://x/a.png", Type: "image"}}, nil
		}}
	return s, p, j, bodies
}

func funds(t *testing.T, s *store.Memory, id string) (core.Wallet, core.JobBilling) {
	t.Helper()
	var w core.Wallet
	var b core.JobBilling
	row, _ := s.Get(t.Context(), "wallets", "u")
	_ = json.Unmarshal(row.Data, &w)
	row, _ = s.Get(t.Context(), "job_billing", id)
	_ = json.Unmarshal(row.Data, &b)
	return w, b
}

func TestDirectChatChargesTokensUsedAndReturnsTheRest(t *testing.T) {
	s, p, j, bodies := directFixture(t, `{"choices":[{"message":{"content":"镜头1：推门"}}],"usage":{"prompt_tokens":1200,"completion_tokens":500}}`, 200)
	if !p.Handles(t.Context(), j) {
		t.Fatal("deepseek: model not routed directly")
	}
	hold := j.CostUnits
	// (input cap + 1000 output) at 1 and 2 points per 1,000 tokens
	if want, _ := billing.TokenUnits(core.ModelSettings{TokenInputPrice: 1, TokenOutputPrice: 2}, billing.Tokens{Input: billing.ChatInputCap(j.Input), Output: 1000}, false); hold != want || hold == 0 {
		t.Fatal("hold", hold, want)
	}
	text, err := p.Generate(t.Context(), j)
	if err != nil || text != "镜头1：推门" {
		t.Fatal(text, err)
	}
	b := (*bodies)[0]
	if b["model"] != "deepseek-chat" || b["max_tokens"].(float64) != 1000 || len(b["messages"].([]any)) != 2 {
		t.Fatal("request body", b) // system prompt + this turn
	}
	// Reading/recovering a completed execution before accounting is settled
	// only records the same usage; it never calls the provider or charges again.
	if again, err := p.Generate(t.Context(), j); err != nil || again != text || len(*bodies) != 1 {
		t.Fatal("pre-settlement repeat", again, err, len(*bodies))
	}
	if err = s.Finish(t.Context(), j, text, ""); err != nil {
		t.Fatal(err)
	}
	w, bill := funds(t, s, j.ID)
	used := int64(220) // (1200×1 + 500×2) / 1000 = 2.2 points
	if bill.State != "charged" || bill.Units != used || bill.ReservedUnits != hold || bill.InputTokens != 1200 || bill.OutputTokens != 500 {
		t.Fatal("billing", bill)
	}
	if w.Available != 100000-used || w.Held != 0 {
		t.Fatal("wallet", w)
	}
	ledger, _ := s.List(t.Context(), "wallet_ledger", "u")
	found := false
	for _, row := range ledger {
		var e core.LedgerEntry
		_ = json.Unmarshal(row.Data, &e)
		if e.Kind == "job_usage" {
			found = e.AvailableDelta == hold-used && strings.Contains(e.Note, "输入 1200 / 输出 500 token") && strings.Contains(e.Note, "2.2 积分")
		}
	}
	if !found {
		t.Fatal("usage settlement entry missing", ledger)
	}
	// A repeat attempt returns the saved reply without calling again.
	if again, err := p.Generate(t.Context(), j); err != nil || again != text || len(*bodies) != 1 {
		t.Fatal("repeat", again, err, len(*bodies))
	}
}

func TestDirectChatNeverChargesMoreThanTheHold(t *testing.T) {
	s, p, j, _ := directFixture(t, `{"choices":[{"message":{"content":"好"}}],"usage":{"prompt_tokens":900000,"completion_tokens":900000}}`, 200)
	text, err := p.Generate(t.Context(), j)
	if err != nil {
		t.Fatal(err)
	}
	_ = s.Finish(t.Context(), j, text, "")
	w, bill := funds(t, s, j.ID)
	if bill.Units != j.CostUnits || w.Available != 100000-j.CostUnits || w.Held != 0 {
		t.Fatal(bill, w)
	}
}

func TestDirectChatFailureReturnsEverything(t *testing.T) {
	s, p, j, _ := directFixture(t, `{"error":{"message":"Insufficient Balance"}}`, 402)
	_, err := p.Generate(t.Context(), j)
	if err == nil || !strings.Contains(err.Error(), "余额不足") {
		t.Fatal(err)
	}
	_ = s.Finish(t.Context(), j, "", err.Error())
	if w, bill := funds(t, s, j.ID); bill.State != "released" || w.Available != 100000 || w.Held != 0 {
		t.Fatal(bill, w)
	}
	// A crash during paid preparation or the reply ends instead of calling twice.
	for _, phase := range []string{"preparing", "submitting"} {
		s2, p2, j2, bodies := directFixture(t, `{}`, 200)
		_, _ = s2.Put(t.Context(), "executions", core.Record{ID: j2.ID, Data: core.Data(Execution{Phase: phase})}, 0)
		if _, err = p2.Generate(t.Context(), j2); err == nil || len(*bodies) != 0 {
			t.Fatal("interrupted turn", phase, err, len(*bodies))
		}
	}
}

// A model that does not read pictures (deepseek-v4-pro) refuses them; one
// that does (deepseek-flash) receives them as image_url parts.
func TestPicturesGoOnlyToModelsThatReadThem(t *testing.T) {
	_, p, j, bodies := directFixture(t, `{}`, 200)
	j.Input.Assets = []string{"asset-1"}
	if _, err := p.Generate(t.Context(), j); err == nil || !strings.Contains(err.Error(), "不能识别图片") || len(*bodies) != 0 {
		t.Fatal(err)
	}
	s, p, j, bodies := directFixture(t, `{"choices":[{"message":{"content":"图里是一杯拿铁"}}],"usage":{"prompt_tokens":900,"completion_tokens":8}}`, 200)
	row, _ := s.Get(t.Context(), "models", "ds")
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.ReferenceTypes = []string{"image"}
	_, _ = s.Put(t.Context(), "models", core.Record{ID: "ds", Data: core.Data(m)}, row.Version)
	j.Input.Assets = []string{"asset-1"}
	if text, err := p.Generate(t.Context(), j); err != nil || text != "图里是一杯拿铁" {
		t.Fatal(text, err)
	}
	raw, _ := json.Marshal((*bodies)[0]["messages"])
	if !strings.Contains(string(raw), `"image_url":{"url":"https://x/a.png"}`) {
		t.Fatal(string(raw))
	}
}

// A streamed reply is saved as it grows (for the page), then kept whole.
func TestDirectChatSavesTheReplySoFar(t *testing.T) {
	s, p, j, _ := directFixture(t, "", 200)
	var mid string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"镜头1\"}}]}\n\n")
		w.(http.Flusher).Flush()
		for i := 0; i < 100 && mid == ""; i++ {
			mid = Partial(r.Context(), s, j.ID)
			time.Sleep(10 * time.Millisecond)
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"：推门\"}}]}\n\ndata: [DONE]\n\n")
	}))
	defer srv.Close()
	p.Clients["deepseek"].BaseURL = srv.URL
	text, err := p.Generate(t.Context(), j)
	if err != nil || text != "镜头1：推门" || mid != "镜头1" {
		t.Fatal(text, err, mid)
	}
	if Partial(t.Context(), s, j.ID) != "" {
		t.Fatal("a finished reply still shows as partial")
	}
}
