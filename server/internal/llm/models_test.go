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

// A model never repriced moves to the new default prices; one an operator
// priced keeps its prices.
func TestOldDefaultPricesMoveToTheCurrentOnes(t *testing.T) {
	hit := 0.0002
	p := Provider{InputPrice: 0.01, OutputPrice: 0.04, CachedPrice: &hit, PeakRate: 2, Previous: [2]float64{0.02, 0.03}}
	old := core.ModelSettings{TokenInputPrice: 0.02, TokenOutputPrice: 0.03}
	if !reprice(&old, p, "deepseek-flash") || old.TokenInputPrice != 0.01 || *old.TokenCachedPrice != hit || old.PeakPriceRate != 2 {
		t.Fatal(old)
	}
	// A Pro row still at the old defaults gets Pro prices, not Flash ones.
	p.ModelPrices = map[string][3]float64{"deepseek-v4-pro": {0.045, 0.0015, 0.135}}
	pro := core.ModelSettings{TokenInputPrice: 0.02, TokenOutputPrice: 0.03}
	if !reprice(&pro, p, "deepseek-v4-pro") || pro.TokenInputPrice != 0.045 || *pro.TokenCachedPrice != 0.0015 || pro.TokenOutputPrice != 0.135 {
		t.Fatal(pro)
	}
	mine := core.ModelSettings{TokenInputPrice: 0.05, TokenOutputPrice: 0.03}
	if reprice(&mine, p, "deepseek-flash") || mine.TokenInputPrice != 0.05 {
		t.Fatal(mine)
	}
}

// DeepSeek Flash reads pictures and V4 Pro does not; Pro gets its own prices.
func TestDeepSeekModelsGetTheirOwnPicturesAndPrices(t *testing.T) {
	s := store.NewMemory()
	hit := 0.0002
	p := Provider{Name: "deepseek", Label: "DeepSeek", Client: &Client{BaseURL: "https://api.deepseek.com", Key: "k"}, Models: []string{"deepseek-flash", "deepseek-v4-pro"},
		Names:      map[string]string{"deepseek-v4-pro": "DeepSeek Pro"},
		InputPrice: 0.01, CachedPrice: &hit, OutputPrice: 0.04, PeakRate: 2, Seeing: []string{"flash"},
		ModelPrices: map[string][3]float64{"deepseek-v4-pro": {0.045, 0.0015, 0.135}}}
	if err := EnsureModels(t.Context(), s, []Provider{p}); err != nil {
		t.Fatal(err)
	}
	flash, _ := model(t, s, ModelID("deepseek", "deepseek-flash"))
	pro, _ := model(t, s, ModelID("deepseek", "deepseek-v4-pro"))
	if len(flash.ReferenceTypes) != 1 || flash.Settings.TokenOutputPrice != 0.04 || *flash.Settings.TokenCachedPrice != hit {
		t.Fatal(flash)
	}
	if pro.Name != "DeepSeek Pro" || flash.Name != "DeepSeek" || len(pro.ReferenceTypes) != 0 || pro.Settings.TokenInputPrice != 0.045 || *pro.Settings.TokenCachedPrice != 0.0015 || pro.Settings.TokenOutputPrice != 0.135 || pro.Settings.PeakPriceRate != 2 {
		t.Fatal(pro)
	}
}

// The picker's description: the model's own tagline, else the provider's;
// an old generic description moves to it, an operator's stays.
func TestTaglinesDescribeModels(t *testing.T) {
	p := Provider{Name: "ark", Label: "豆包", Tagline: map[string]string{"": "看图细致"}}
	if tagline(p, "doubao-x") != "看图细致" || tagline(Provider{Label: "DeepSeek"}, "x") != "DeepSeek 对话模型" {
		t.Fatal("tagline")
	}
	s := store.NewMemory()
	old := core.Model{ID: ModelID("ark", "d"), Key: "ark:d", Kind: "chat", Settings: core.ModelSettings{Description: "豆包 对话模型，按 token 计费"}}
	_, _ = s.Put(t.Context(), "models", core.Record{ID: old.ID, Data: core.Data(old)}, 0)
	p.Client, p.Models = &Client{}, []string{"d"}
	if err := EnsureModels(t.Context(), s, []Provider{p}); err != nil {
		t.Fatal(err)
	}
	if m, _ := model(t, s, old.ID); m.Settings.Description != "看图细致" {
		t.Fatal(m.Settings.Description)
	}
}

// 豆包 takes videos itself: new rows list video, old ["image"] rows gain it.
func TestArkModelsTakeVideos(t *testing.T) {
	s := store.NewMemory()
	old := core.Model{ID: ModelID("ark", "old"), Key: "ark:old", Kind: "chat", ReferenceTypes: []string{"image"}}
	_, _ = s.Put(t.Context(), "models", core.Record{ID: old.ID, Data: core.Data(old)}, 0)
	p := Provider{Name: "ark", Label: "豆包", Client: &Client{}, Models: []string{"old", "new"}, Watches: true}
	if err := EnsureModels(t.Context(), s, []Provider{p}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"old", "new"} {
		if m, _ := model(t, s, ModelID("ark", id)); len(m.ReferenceTypes) != 2 || m.ReferenceTypes[1] != "video" {
			t.Fatal(id, m.ReferenceTypes)
		}
	}
}

// 豆包 still at the old default (¥2 output) moves to Seed 2.1 lite's ¥2.7;
// it has no cache or peak price of its own.
func TestArkOldDefaultMovesToTheCurrentPrice(t *testing.T) {
	p := Provider{Name: "ark", InputPrice: 0.008, OutputPrice: 0.027, Previous: [2]float64{0.008, 0.02}}
	s := core.ModelSettings{TokenInputPrice: 0.008, TokenOutputPrice: 0.02}
	if !reprice(&s, p, "doubao-seed-2-1-lite-260915") || s.TokenOutputPrice != 0.027 || s.TokenCachedPrice != nil || s.PeakPriceRate != 0 {
		t.Fatal(s)
	}
	if reprice(&s, p, "doubao-seed-2-1-lite-260915") {
		t.Fatal("repriced twice")
	}
}
