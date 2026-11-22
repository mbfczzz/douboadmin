package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"doubo/server/internal/relay"
	"encoding/json"
	"strings"
	"testing"
)

// DeepSeek / 豆包 models are listed by 对话模型 settings, so a relay sync
// leaves them alone; their quote is the most a turn can cost (按量).
func TestDirectChatModelSurvivesRelaySyncAndQuotesPerToken(t *testing.T) {
	a, admin := modelServer(t)
	m := core.Model{ID: "ds", Key: "deepseek:deepseek-chat", Name: "DeepSeek", Kind: "chat", Published: true, Available: true,
		ReferenceTypes: []string{}, Settings: core.ModelSettings{TokenInputPrice: 0.02, TokenOutputPrice: 0.03}}
	if _, err := a.Store.Put(t.Context(), "models", core.Record{ID: "ds", Data: core.Data(m)}, 0); err != nil {
		t.Fatal(err)
	}
	if w := call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	row, _ := a.Store.Get(t.Context(), "models", "ds")
	_ = json.Unmarshal(row.Data, &m)
	if !m.Available {
		t.Fatal("relay sync hid a DeepSeek model")
	}
	a2, one, _ := setup(t)
	_, _ = a2.Store.Put(t.Context(), "models", core.Record{ID: "ds", Data: core.Data(m)}, 0)
	w := call(a2, "POST", "/api/jobs/quote", one, "", core.JobInput{Kind: "chat", Model: "ds", Prompt: "写脚本", Assets: []string{}, Purpose: "agent"})
	var q struct {
		ConfiguredUnits int64 `json:"configuredUnits"`
		PerToken        bool  `json:"perToken"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &q) != nil || !q.PerToken || q.ConfiguredUnits <= 0 {
		t.Fatal(w.Code, w.Body.String())
	}
}

// While a chat turn is written its reply so far is readable by its owner only.
func TestChatReplySoFarIsShownToItsOwner(t *testing.T) {
	a, one, two := setup(t)
	j := core.NewJob("user-a", core.NewID(), core.JobInput{Kind: "chat", Model: "ds", Prompt: "写脚本", Assets: []string{}})
	if _, err := a.Store.CreateJob(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Claim(t.Context()); err != nil {
		t.Fatal(err)
	}
	e := provider.Execution{Phase: "submitting", Partial: "镜头1：推门"}
	if _, err := a.Store.Put(t.Context(), "executions", core.Record{ID: j.ID, Data: core.Data(e)}, 0); err != nil {
		t.Fatal(err)
	}
	w := call(a, "GET", "/api/jobs/"+j.ID+"/reply", one, "", nil)
	var got map[string]string
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &got) != nil || got["status"] != "running" || got["text"] != "镜头1：推门" {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/jobs/"+j.ID+"/reply", two, "", nil); w.Code != 404 {
		t.Fatal("another user read the reply", w.Code)
	}
}

// Without the relay, DeepSeek / 豆包 still appear (they are called directly);
// relay models do not.
func TestDirectChatModelsShowWithoutTheRelay(t *testing.T) {
	a, _, _ := setup(t)
	a.Relay = relay.New("", "")
	m := core.Model{ID: "ds", Key: "deepseek:deepseek-flash", Name: "DeepSeek", Kind: "chat", Published: true, Available: true, ReferenceTypes: []string{"image"}}
	if _, err := a.Store.Put(t.Context(), "models", core.Record{ID: "ds", Data: core.Data(m)}, 0); err != nil {
		t.Fatal(err)
	}
	var cfg struct {
		Models []core.Model `json:"models"`
	}
	w := call(a, "GET", "/api/config", "", "", nil)
	if json.Unmarshal(w.Body.Bytes(), &cfg) != nil || len(cfg.Models) != 1 || cfg.Models[0].Key != "deepseek:deepseek-flash" {
		t.Fatal(w.Body.String())
	}
}

// A direct-provider key is valid only for chat. Even a malformed model row
// cannot make Agent or any client bypass the site's media-generation relay.
func TestDirectChatModelCannotGenerateMedia(t *testing.T) {
	a, user, _ := setup(t)
	m := core.Model{
		ID: "bad-video", Key: "ark:doubao-seedance-direct", Name: "Bad direct video",
		Kind: "video", Published: true, Available: true, Modes: []string{"t2v"},
		Durations: []int{5}, Resolutions: []string{"720p"}, Ratios: []string{"9:16"},
	}
	_, _ = a.Store.Put(t.Context(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
	in := core.JobInput{Kind: "video", Model: m.ID, Prompt: "test", Mode: "t2v", Duration: 5, Resolution: "720p", Ratio: "9:16", Assets: []string{}}
	w := call(a, "POST", "/api/jobs", user, "direct-media-blocked", in)
	if w.Code != 400 || !strings.Contains(w.Body.String(), "豆播创作") {
		t.Fatal(w.Code, w.Body.String())
	}
}
