package api

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

// A published template disappears for users once its model is unpublished,
// instead of staying listed but failing on submit.
func TestTemplateHiddenWhenModelUnpublished(t *testing.T) {
	a, token := modelServer(t)
	_ = call(a, "POST", "/api/admin/models/sync", token, "", nil)
	id := templateVideoModel(t, a)
	tmpl := core.Template{Title: "Model gated", Kind: "video", Prompt: "A product video", Cover: "https://example.com/cover.png", Published: true}
	tmpl.Model, tmpl.Ratio, tmpl.Resolution, tmpl.Duration = id, "1:1", "720p", 5
	if code := call(a, "PUT", "/api/admin/templates/gated", token, "", map[string]any{"version": 0, "data": tmpl}).Code; code != 200 {
		t.Fatalf("save template: %d", code)
	}
	listed := func() bool {
		return strings.Contains(call(a, "GET", "/api/templates", "", "", nil).Body.String(), "Model gated")
	}
	if !listed() || call(a, "GET", "/api/templates/gated", "", "", nil).Code != 200 {
		t.Fatal("template with a live model must be visible")
	}
	ctx := context.Background()
	row, err := a.Store.Get(ctx, "models", id)
	if err != nil {
		t.Fatal(err)
	}
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.Published = false
	row.Data = core.Data(m)
	if _, err = a.Store.Put(ctx, "models", row, row.Version); err != nil {
		t.Fatal(err)
	}
	if listed() || call(a, "GET", "/api/templates/gated", "", "", nil).Code != 404 {
		t.Fatal("template of an unpublished model must be hidden from users")
	}
	if !strings.Contains(call(a, "GET", "/api/admin/templates", token, "", nil).Body.String(), "Model gated") {
		t.Fatal("admins still manage the template")
	}
}

func TestTemplateImageCountWithinModelLimits(t *testing.T) {
	m := core.Model{Kind: "image"}
	m.ParamsSchema = core.Data(map[string]any{"edit_images": map[string]int{"min": 2, "max": 4}})
	for n, ok := range map[int]bool{0: true, 1: false, 2: true, 4: true, 5: false} {
		mode := "t2i"
		if n > 0 {
			mode = "i2i"
		}
		if err := templateImageLimits(m, mode, n); (err == nil) != ok {
			t.Fatalf("%d images: got %v, want ok=%v", n, err, ok)
		}
	}
}

func TestOmniTemplateRespectsZeroImageLimit(t *testing.T) {
	m := core.Model{Kind: "video"}
	m.ParamsSchema = core.Data(map[string]any{"ref_limits": map[string]int{"image": 0}})
	if templateImageLimits(m, "omni_ref", 2) == nil {
		t.Fatal("a model that takes no reference images accepted an image template")
	}
}

func TestUnfavoriteNeverCreatesRecordsForUnknownTemplates(t *testing.T) {
	a, user, _ := activationFixture(t)
	activate(t, a, "user-a")
	for range 3 {
		if w := call(a, "PUT", "/api/favorites/no-such-template", user, "", map[string]any{"version": 0, "active": false}); w.Code != 404 {
			t.Fatal("unknown template accepted", w.Code, w.Body.String())
		}
	}
	if rows, _ := a.Store.List(t.Context(), "favorites", ""); len(rows) != 0 {
		t.Fatal("junk favorites stored", len(rows))
	}
}
