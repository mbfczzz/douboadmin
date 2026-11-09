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
	id := core.Digest("image-live")[:32]
	tmpl := core.Template{Title: "Model gated", Kind: "image", Prompt: "A product photo", Cover: "https://example.com/cover.png", Published: true}
	tmpl.Model, tmpl.Ratio, tmpl.Resolution, tmpl.Quality = id, "1:1", "1k", "high"
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
