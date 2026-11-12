package api

import (
	"encoding/json"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func templateVideoModel(t *testing.T, a *Server) string {
	t.Helper()
	m := core.Model{ID: "demo-video", Key: "fixture-video", Name: "Video model", Kind: "video",
		Published: true, Available: true, Resolutions: []string{"720p"}, Ratios: []string{"1:1", "16:9"},
		Durations: []int{5}, Modes: []string{"t2v", "i2v"}}
	if _, e := a.Store.Put(t.Context(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0); e != nil {
		t.Fatal(e)
	}
	return m.ID
}

func TestTemplatesAreVideoOnlyAcrossCatalogDetailsFavoritesAndGeneration(t *testing.T) {
	a, user, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	videoModel := templateVideoModel(t, a)
	for _, item := range []struct {
		id, kind, category, model string
		published                 bool
	}{
		{"legacy-image", "image", "旧图片分类", "demo-image", true},
		{"public-video", "video", "视频分类", videoModel, true},
		{"draft-video", "video", "视频草稿", videoModel, false},
	} {
		data := core.Template{Title: item.id, Kind: item.kind, Category: item.category, Published: item.published,
			Prompt: "test", Cover: "https://example.test/cover.jpg", GenerationOptions: core.GenerationOptions{
				Model: item.model, Resolution: "720p", Ratio: "1:1", Duration: 5, Mode: "t2v"}}
		if item.kind == "image" {
			data.Resolution, data.Duration, data.Mode = "1K", 0, "t2i"
		}
		if _, e := a.Store.Put(t.Context(), "templates", core.Record{ID: item.id, Data: core.Data(data)}, 0); e != nil {
			t.Fatal(e)
		}
	}
	for _, path := range []string{"/api/templates", "/api/templates?page=1&size=4", "/api/templates?kind=image", "/api/templates?page=1&kind=image", "/api/admin/templates", "/api/admin/templates?page=1", "/api/admin/templates?kind=image", "/api/admin/templates?page=1&kind=image", "/api/admin/templates/categories", "/api/config"} {
		w := call(a, "GET", path, admin, "", nil)
		if w.Code != 200 || strings.Contains(w.Body.String(), "legacy-image") || strings.Contains(w.Body.String(), "旧图片分类") {
			t.Fatal(path, w.Code, w.Body.String())
		}
	}
	var page core.RecordPage
	w := call(a, "GET", "/api/admin/templates?page=1", admin, "", nil)
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 2 {
		t.Fatal("admin pagination includes legacy images", w.Body.String())
	}
	w = call(a, "GET", "/api/templates?page=1", user, "", nil)
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 1 {
		t.Fatal("public pagination wrong", w.Body.String())
	}
	if w := call(a, "GET", "/api/templates/legacy-image", user, "", nil); w.Code != 404 {
		t.Fatal("legacy image detail exposed", w.Code)
	}
	if w := call(a, "GET", "/api/templates/public-video", user, "", nil); w.Code != 200 {
		t.Fatal("video detail hidden", w.Code)
	}
	if w := call(a, "PUT", "/api/favorites/legacy-image", user, "", map[string]any{"version": 0, "active": true}); w.Code != 404 {
		t.Fatal("legacy image favorited", w.Code)
	}
	favorite := core.Record{ID: "old-image-favorite", Owner: "user-a", Data: core.Data(map[string]any{"templateId": "legacy-image", "active": true})}
	if _, e := a.Store.Put(t.Context(), "favorites", favorite, 0); e != nil {
		t.Fatal(e)
	}
	w = call(a, "GET", "/api/favorites/templates?page=1", user, "", nil)
	var favorites struct{ Items, Unavailable []core.Record }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &favorites) != nil || len(favorites.Items) != 0 || len(favorites.Unavailable) != 1 {
		t.Fatal("legacy favorite was not marked unavailable", w.Body.String())
	}
	in := core.JobInput{Kind: "image", Model: "demo-image", Resolution: "1K", Ratio: "1:1", Prompt: "test", TemplateID: "legacy-image"}
	if w := call(a, "POST", "/api/jobs", user, "legacy-template-denied", in); w.Code != 400 {
		t.Fatal("legacy image template submitted", w.Code, w.Body.String())
	}
	in.TemplateID = ""
	if w := call(a, "POST", "/api/jobs", user, "free-image-still-works", in); w.Code != 202 {
		t.Fatal("free image creation was restricted", w.Code, w.Body.String())
	}
}

func TestAdminRejectsNonVideoTemplatesEvenAsDrafts(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	model := templateVideoModel(t, a)
	template := core.Template{Title: "Video only", Kind: "video", Prompt: "test", Cover: "https://example.test/cover.jpg", GenerationOptions: core.GenerationOptions{Model: model, Resolution: "720p", Ratio: "1:1", Duration: 5}}
	for _, kind := range []string{"image", "", "audio"} {
		for _, published := range []bool{false, true} {
			template.Kind, template.Published = kind, published
			w := call(a, "PUT", "/api/admin/templates/invalid", admin, "", map[string]any{"version": 0, "data": template})
			if w.Code != 400 || !strings.Contains(w.Body.String(), "模板仅支持视频") {
				t.Fatal("unsupported template accepted", kind, published, w.Code)
			}
		}
	}
	template.Kind, template.Published = "video", true
	template.Model = "demo-image"
	if w := call(a, "PUT", "/api/admin/templates/video", admin, "", map[string]any{"version": 0, "data": template}); w.Code != 400 {
		t.Fatal("image model accepted for video")
	}
	template.Model = model
	if w := call(a, "PUT", "/api/admin/templates/video", admin, "", map[string]any{"version": 0, "data": template}); w.Code != 200 {
		t.Fatal("video save failed", w.Code, w.Body.String())
	}
}
