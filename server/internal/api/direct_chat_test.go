package api

import (
	"doubo/server/internal/core"
	"encoding/json"
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
