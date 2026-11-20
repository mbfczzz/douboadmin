package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

// 生成默认服装: one free image job per default outfit (drafts meanwhile);
// finished pictures publish their outfit, failures say why and are redone
// by pressing again, deleted ones are never redrawn.
func TestDefaultOutfitsAreDrawnThenPublished(t *testing.T) {
	a, one, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	if w := call(a, "POST", "/api/admin/outfits/defaults", one, "", map[string]string{"model": "demo-image"}); w.Code < 400 {
		t.Fatal("a user started the defaults")
	}
	if w := call(a, "POST", "/api/admin/outfits/defaults", admin, "", map[string]string{"model": "missing"}); w.Code != 400 {
		t.Fatal("unknown model accepted", w.Code)
	}
	var started struct{ Started, Total int }
	w := call(a, "POST", "/api/admin/outfits/defaults", admin, "", map[string]string{"model": "demo-image"})
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &started) != nil || started.Started != len(defaultOutfits) {
		t.Fatal(w.Code, w.Body.String())
	}
	// Pressing again while they draw starts nothing.
	_ = json.Unmarshal(call(a, "POST", "/api/admin/outfits/defaults", admin, "", map[string]string{"model": "demo-image"}).Body.Bytes(), &started)
	if started.Started != 0 {
		t.Fatal("drawn twice", started)
	}
	seedJob := func(id string) core.Job {
		row, _ := a.Store.Get(t.Context(), "outfits", id)
		var o core.Outfit
		_ = json.Unmarshal(row.Data, &o)
		j, err := a.Store.Job(t.Context(), o.SeedJob)
		if err != nil {
			t.Fatal(id, err)
		}
		return j
	}
	claimed := map[string]core.Job{} // as the worker does
	for range defaultOutfits {
		j, err := a.Store.Claim(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		claimed[j.ID] = j
	}
	coat, gown := claimed[seedJob("default-winter-coat").ID], claimed[seedJob("default-party-gown").ID]
	if coat.CostUnits != 0 || coat.Input.Kind != "image" || coat.Input.Ratio != "1:1" || coat.Input.Resolution != "1K" {
		t.Fatalf("%+v", coat)
	}
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "drawn", Owner: coat.UserID, Data: core.Data(map[string]any{"key": "results/coat.png", "type": "image/png", "size": 9})}, 0)
	if err := a.Store.Finish(t.Context(), coat, "asset:drawn", ""); err != nil {
		t.Fatal(err)
	}
	if err := a.Store.Finish(t.Context(), gown, "", "上游拒绝"); err != nil {
		t.Fatal(err)
	}
	var list struct {
		Seeding int           `json:"seeding"`
		Items   []adminOutfit `json:"items"`
	}
	_ = json.Unmarshal(call(a, "GET", "/api/admin/outfits?page=1&size=100", admin, "", nil).Body.Bytes(), &list)
	if list.Seeding != len(defaultOutfits)-2 {
		t.Fatal("still drawing", list.Seeding)
	}
	byID := map[string]core.Outfit{}
	for _, it := range list.Items {
		byID[it.ID] = it.Data
		if (it.Image == "") != (it.Data.ImageKey == "") {
			t.Fatal("picture address without a picture", it.ID, it.Image)
		}
	}
	if c := byID["default-winter-coat"]; !c.Published || c.ImageAssetID != "drawn" || c.ImageKey != "results/coat.png" || c.SeedJob != "" {
		t.Fatalf("coat %+v", c)
	}
	if g := byID["default-party-gown"]; g.Published || g.SeedError == "" || g.SeedJob != "" {
		t.Fatalf("gown %+v", g)
	}
	// Categories follow the outfits' order; users see only the pictured one.
	coat2 := claimed[seedJob("default-spring-trench").ID]
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "drawn2", Owner: coat2.UserID, Data: core.Data(map[string]any{"key": "results/t.png", "type": "image/png"})}, 0)
	_ = a.Store.Finish(t.Context(), coat2, "asset:drawn2", "")
	_ = call(a, "GET", "/api/admin/outfits?page=1", admin, "", nil)
	var cats []outfitCategory
	_ = json.Unmarshal(call(a, "GET", "/api/outfits/categories", one, "", nil).Body.Bytes(), &cats)
	if len(cats) != 2 || cats[0].Name != "春季" || cats[1].Name != "冬季" {
		t.Fatal(cats)
	}
	var page struct{ Total int }
	_ = json.Unmarshal(call(a, "GET", "/api/outfits?page=1", one, "", nil).Body.Bytes(), &page)
	if page.Total != 2 {
		t.Fatal("drafts shown to users", page.Total)
	}
	// Again: only the failed one is redrawn; a deleted default never is.
	row, _ := a.Store.Get(t.Context(), "outfits", "default-men-coat")
	if w := call(a, "DELETE", "/api/admin/outfits/default-men-coat", admin, "", map[string]any{"version": row.Version}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	_ = json.Unmarshal(call(a, "POST", "/api/admin/outfits/defaults", admin, "", map[string]string{"model": "demo-image"}).Body.Bytes(), &started)
	if started.Started != 1 || seedJob("default-party-gown").ID == gown.ID {
		t.Fatal("redraw", started)
	}
}
