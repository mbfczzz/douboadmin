package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

// Uploaded videos carry a signed first-frame cover so the creation page can
// show a thumbnail (reference strip and @ mentions); images do not need one.
func TestAssetLookupAddsVideoCover(t *testing.T) {
	a, user, _ := setup(t)
	a.Objects = &thumbnailObjects{}
	for id, typ := range map[string]string{"clip": "video/mp4", "photo": "image/png"} {
		if _, e := a.Store.Put(t.Context(), "assets", core.Record{ID: id, Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/" + id, "type": typ})}, 0); e != nil {
			t.Fatal(e)
		}
	}
	read := func(id string) map[string]any {
		t.Helper()
		w := call(a, "GET", "/api/assets/"+id, user, "", nil)
		var row struct {
			Data map[string]any `json:"data"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		return row.Data
	}
	if v := read("clip"); v["url"] != "https://fixture.test/original" || v["thumbnailUrl"] != "https://fixture.test/signed-small" {
		t.Fatal("video asset missing signed cover", v)
	}
	if v := read("photo"); v["thumbnailUrl"] != nil {
		t.Fatal("image asset should not carry a cover", v)
	}
	a.Objects.(*thumbnailObjects).fail = true
	if v := read("clip"); v["thumbnailUrl"] != nil || v["url"] == nil {
		t.Fatal("a failed snapshot must still return the video", v)
	}
}
