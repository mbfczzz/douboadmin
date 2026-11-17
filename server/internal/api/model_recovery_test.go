package api

import (
	"encoding/json"
	"testing"

	"doubo/server/internal/core"
)

func TestDeletedModelVisibilitySyncAndExplicitRestore(t *testing.T) {
	a, admin := modelServer(t)
	if w := call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	id := core.Digest("image-live")[:32]
	row, _ := a.Store.Get(t.Context(), "models", id)
	var model core.Model
	_ = json.Unmarshal(row.Data, &model)
	model.Name, model.Points, model.Sort = "保留的模型名称", 18, 9
	model.Settings = core.ModelSettings{MaxPromptChars: 3000, DefaultPrompt: "保留的提示词"}
	row, err := a.Store.Put(t.Context(), "models", core.Record{ID: id, Data: core.Data(model)}, row.Version)
	if err != nil {
		t.Fatal(err)
	}
	if w := call(a, "DELETE", "/api/admin/models/"+id, admin, "", map[string]any{"version": row.Version}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w := call(a, "POST", "/api/admin/models/sync", admin, "", nil)
	var sync map[string]int
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &sync) != nil || sync["updated"] != 1 || sync["hidden"] != 1 || sync["created"] != 0 {
		t.Fatal("hidden updates are not explained", w.Body.String())
	}
	page := func(query string) core.RecordPage {
		t.Helper()
		w := call(a, "GET", "/api/admin/models?page=1&size=20&q=Image%20Live"+query, admin, "", nil)
		var result core.RecordPage
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		return result
	}
	if got := page(""); got.Total != 0 {
		t.Fatal("sync resurrected deleted rows")
	}
	deleted := page("&deleted=true&kind=image")
	if deleted.Total != 1 || deleted.Items[0].ID != id {
		t.Fatal("cannot find deleted model", deleted)
	}
	var synced core.Model
	if json.Unmarshal(deleted.Items[0].Data, &synced) != nil || synced.Name != "Image Live" {
		t.Fatal("deleted model name did not follow upstream", synced)
	}
	if got := page("&deleted=true&kind=video"); got.Total != 0 {
		t.Fatal("kind filter lost")
	}
	if w := call(a, "GET", "/api/admin/models?page=1&deleted=bogus", admin, "", nil); w.Code != 400 {
		t.Fatal("invalid deletion filter accepted")
	}
	if w := call(a, "GET", "/api/admin/models?page=1&deleted=true", "", "", nil); w.Code != 401 {
		t.Fatal("anonymous deleted listing allowed")
	}
	stale := deleted.Items[0].Version - 1
	w = call(a, "POST", "/api/admin/models", admin, "", map[string]any{"key": "image-live", "version": stale})
	if w.Code != 409 || page("&deleted=true").Total != 1 {
		t.Fatal("stale restoration succeeded")
	}
	w = call(a, "POST", "/api/admin/models", admin, "", map[string]any{"key": "image-live", "version": deleted.Items[0].Version})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	if page("").Total != 1 || page("&deleted=true").Total != 0 {
		t.Fatal("restored model stayed hidden")
	}
	restored, _ := a.model(t.Context(), id)
	if restored.Deleted || !restored.Published || restored.Name != synced.Name || restored.Points != model.Points || restored.Sort != model.Sort || restored.Settings.DefaultPrompt != model.Settings.DefaultPrompt || restored.Settings.MaxPromptChars != 3000 {
		t.Fatal("restoration discarded operator configuration", restored)
	}
}
