package llm

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"testing"
)

func model(t *testing.T, s store.Store, id string) (core.Model, int64) {
	t.Helper()
	row, err := s.Get(t.Context(), "models", id)
	if err != nil {
		t.Fatal(id, err)
	}
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	return m, row.Version
}

func TestEnsureModelsListsConfiguredModelsAndKeepsOperatorSettings(t *testing.T) {
	s := store.NewMemory()
	ctx := t.Context()
	providers := []Provider{
		{Name: "deepseek", Label: "DeepSeek", Client: &Client{BaseURL: "https://api.deepseek.com", Key: "k"}, Models: []string{"deepseek-chat"}, InputPrice: 0.02, OutputPrice: 0.03},
		{Name: "ark", Label: "豆包", Client: &Client{BaseURL: "https://ark"}, Models: []string{"doubao-lite"}, InputPrice: 0.008, OutputPrice: 0.02},
	}
	if err := EnsureModels(ctx, s, providers); err != nil {
		t.Fatal(err)
	}
	ds, version := model(t, s, ModelID("deepseek", "deepseek-chat"))
	if ds.Key != "deepseek:deepseek-chat" || ds.Kind != "chat" || !ds.Published || !ds.Available || ds.Settings.TokenInputPrice != 0.02 || len(ds.ReferenceTypes) != 0 {
		t.Fatal(ds)
	}
	ark, _ := model(t, s, ModelID("ark", "doubao-lite"))
	if ark.Available || ark.ReferenceTypes[0] != "image" { // no key yet
		t.Fatal(ark)
	}
	// Operator renames and reprices; a restart keeps both.
	ds.Name, ds.Settings.TokenOutputPrice = "创作助手", 0.5
	if _, err := s.Put(ctx, "models", core.Record{ID: ds.ID, Data: core.Data(ds)}, version); err != nil {
		t.Fatal(err)
	}
	providers[1].Client.Key = "ark-key"
	providers[0].Models = nil // DeepSeek model removed from the list
	if err := EnsureModels(ctx, s, providers); err != nil {
		t.Fatal(err)
	}
	ds, _ = model(t, s, ds.ID)
	if ds.Name != "创作助手" || ds.Settings.TokenOutputPrice != 0.5 || ds.Available {
		t.Fatal("removed model should be unavailable but keep its settings", ds)
	}
	if ark, _ = model(t, s, ark.ID); !ark.Available {
		t.Fatal("ark key added", ark)
	}
	// Relay models are not touched.
	relay := core.Model{ID: "r1", Key: "seedance", Kind: "video", Available: true}
	_, _ = s.Put(ctx, "models", core.Record{ID: "r1", Data: core.Data(relay)}, 0)
	if err := EnsureModels(ctx, s, providers); err != nil {
		t.Fatal(err)
	}
	if relay, _ = model(t, s, "r1"); !relay.Available {
		t.Fatal(relay)
	}
}
