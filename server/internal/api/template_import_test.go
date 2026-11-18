package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func importFixture(t *testing.T) (*Server, string, string, map[string]any) {
	t.Helper()
	a, user, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	for _, m := range []core.Model{
		{ID: "import-model", Key: "source-video", Name: "Default", Kind: "video", Published: true, Available: true, Resolutions: []string{"720p"}, Ratios: []string{"9:16"}, Durations: []int{30}, Modes: []string{"omni_ref"}, ReferenceTypes: []string{"image"}},
		{ID: "import-choice", Key: "other-video", Name: "Choice", Kind: "video", Points: 110, Published: true, Available: true, Resolutions: []string{"1080p"}, Ratios: []string{"9:16"}, Durations: []int{30}, Modes: []string{"omni_ref"}, ReferenceTypes: []string{"image"}},
	} {
		if _, err := a.Store.Put(t.Context(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0); err != nil {
			t.Fatal(err)
		}
	}
	recipe := map[string]any{"id": "large-source-id", "kind": "inspiration", "mediaType": "video", "title": "完整配方", "prompt": strings.Repeat("场景描述", 300) + " {{image:1}} {{image:6}}", "coverUrl": "https://cdn.example/cover.jpg", "mode": "ref", "modelKey": "source-video", "selectableModelKeys": []string{"other-video"}, "status": 1,
		"requirements": map[string]any{"images": 6, "optionalImages": []int{2, 3, 4, 5}}, "inputLabels": map[string]any{"images": []string{"人物", "场景", "品牌", "细节", "卖点", "商品"}}, "options": map[string]any{"duration": 30, "resolution": "720p", "aspectRatio": "9:16"}}
	pack := map[string]any{"format": "flowlight.studio-templates", "schemaVersion": 1, "sourceOrigin": "https://flowlight.tcmzhan.com", "total": 2, "templates": []any{recipe, map[string]any{"id": "image", "mediaType": "image", "title": "图片"}}}
	return a, admin, user, map[string]any{"pack": pack, "publish": false}
}

func TestTemplateImportPreflightPrivacyAndIdempotentDraftCreation(t *testing.T) {
	a, admin, user, body := importFixture(t)
	for token, want := range map[string]int{"": 401, user: 403} {
		if w := call(a, "POST", "/api/admin/templates/import", token, "", body); w.Code != want {
			t.Fatal(w.Code)
		}
	}
	preview := call(a, "POST", "/api/admin/templates/import-preview", admin, "", body)
	var plan struct {
		Counts map[string]int
		Items  []struct{ ID string }
	}
	if preview.Code != 200 || json.Unmarshal(preview.Body.Bytes(), &plan) != nil || plan.Counts["create"] != 1 || plan.Counts["skip"] != 1 || strings.Contains(preview.Body.String(), "场景描述") {
		t.Fatal(preview.Body.String())
	}
	if rows, _ := a.Store.List(t.Context(), "templates", ""); len(rows) != 0 {
		t.Fatal("preview wrote templates")
	}
	apply := call(a, "POST", "/api/admin/templates/import", admin, "", body)
	if apply.Code != 200 || !strings.Contains(apply.Body.String(), `"imported":1`) {
		t.Fatal(apply.Body.String())
	}
	row, err := a.Store.Get(t.Context(), "templates", plan.Items[0].ID)
	var recipe core.Template
	if err != nil || json.Unmarshal(row.Data, &recipe) != nil || recipe.Published || len(recipe.ImageSlots) != 6 || recipe.RequiredImages != 2 || len(recipe.Prompt) < 500 || len(recipe.SelectableModels) != 1 {
		t.Fatal("recipe lost", recipe, err)
	}
	if w := call(a, "POST", "/api/admin/templates/import", admin, "", body); !strings.Contains(w.Body.String(), `"duplicate":1`) {
		t.Fatal(w.Body.String())
	}
	rows, _ := a.Store.List(t.Context(), "templates", "")
	if len(rows) != 1 {
		t.Fatal("duplicate templates")
	}
	jobs, _ := a.Store.Jobs(t.Context(), "")
	if len(jobs) != 0 {
		t.Fatal("import generated work")
	}
}

func TestImportedTemplateUsesServerPromptAndExplicitImageSlots(t *testing.T) {
	a, admin, user, body := importFixture(t)
	a.Objects = &countingObjects{}
	body["publish"] = true
	w := call(a, "POST", "/api/admin/templates/import", admin, "", body)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"imported":1`) {
		t.Fatal(w.Body.String())
	}
	rows, _ := a.Store.List(t.Context(), "templates", "")
	for _, id := range []string{"person", "product"} {
		_, err := a.Store.Put(t.Context(), "assets", core.Record{ID: id, Owner: "user-a", Data: core.Data(map[string]any{"type": "image/jpeg", "size": 100})}, 0)
		if err != nil {
			t.Fatal(err)
		}
	}
	in := core.JobInput{Kind: "video", TemplateID: rows[0].ID, Model: "import-choice", Resolution: "1080p", Ratio: "9:16", Duration: 30, Assets: []string{"product", "person"}, ImageSlots: []int{6, 1}}
	quote := call(a, "POST", "/api/jobs/quote", user, "", in)
	var price struct{ Units int64 }
	if quote.Code != 200 || json.Unmarshal(quote.Body.Bytes(), &price) != nil || price.Units != 11000 {
		t.Fatalf("quote with only required images: %d %s", quote.Code, quote.Body.String())
	}
	missing := in
	missing.Assets, missing.ImageSlots = in.Assets[:1], in.ImageSlots[:1]
	if w := call(a, "POST", "/api/jobs/quote", user, "", missing); w.Code != 400 || !strings.Contains(w.Body.String(), "请上传人物") {
		t.Fatalf("quote without required image: %d %s", w.Code, w.Body.String())
	}
	in.Prompt = "tampered"
	if err := a.validateJob(t.Context(), "user-a", &in); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(in.Prompt, "tampered") || !strings.Contains(in.Prompt, "@图2 @图1") || !strings.Contains(in.Prompt, "未上传的") {
		t.Fatal("incorrect recipe binding", in.Prompt)
	}
	public := call(a, "GET", "/api/templates/"+rows[0].ID, user, "", nil)
	if public.Code != 200 || strings.Contains(public.Body.String(), "场景描述") {
		t.Fatal("private recipe leaked", public.Body.String())
	}
	in.ImageSlots = []int{1, 1}
	if err := a.bindTemplateRecipe(t.Context(), &in); err == nil {
		t.Fatal("duplicate position accepted")
	}
	_, err := a.Store.Put(t.Context(), "assets", core.Record{ID: "video-asset", Owner: "user-a", Data: core.Data(map[string]any{"type": "video/mp4"})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	in.Assets, in.ImageSlots = []string{"video-asset", "person"}, []int{6, 1}
	if err := a.bindTemplateRecipe(t.Context(), &in); err == nil {
		t.Fatal("video bound to an image slot")
	}
}
