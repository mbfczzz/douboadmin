package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

// 做同款 from a 模板案例: the template's sample picture becomes the user's own
// asset (the same one again), usable as a reference; drafts give nothing.
func TestTemplateSampleIsTheUsersOwnAsset(t *testing.T) {
	a, one, two := setup(t)
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "cover", Owner: "admin-x", Data: core.Data(map[string]any{"key": "uploads/admin/c.jpg", "type": "image/jpeg", "size": 9})}, 0)
	for id, published := range map[string]bool{"tpl": true, "draft": false} {
		tpl := core.Template{Title: "洗衣机", Kind: "video", Published: published, CoverAssetID: "cover", GenerationOptions: core.GenerationOptions{Model: "demo-image"}}
		_, _ = a.Store.Put(t.Context(), "templates", core.Record{ID: id, Data: core.Data(tpl)}, 0)
	}
	use := func(token, id string) string {
		var row core.Record
		w := call(a, "POST", "/api/templates/"+id+"/sample", token, "", nil)
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
			return ""
		}
		return row.ID
	}
	first := use(one, "tpl")
	if first == "" || !a.ownImage(t.Context(), first, "user-a") {
		t.Fatal("not the user's own picture", first)
	}
	if use(one, "tpl") != first || use(two, "tpl") == first {
		t.Fatal("asset not stable per user")
	}
	if use(one, "draft") != "" {
		t.Fatal("a draft template gave its picture")
	}
}
