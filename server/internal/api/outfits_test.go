package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// 试衣服装: the admin uploads and publishes; users list published ones by
// category, pick at random, read their 收藏 by ids, and picking one gives
// them their own (stable) asset for the try-on job.
func TestOutfitLibraryAdminAndUser(t *testing.T) {
	a, one, two := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	var me struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(call(a, "GET", "/api/admin/me", admin, "", nil).Body.Bytes(), &me)
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "pic", Owner: me.ID, Data: core.Data(map[string]any{"key": "uploads/a/pic.jpg", "type": "image/jpeg", "size": 2048})}, 0)
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "clip", Owner: me.ID, Data: core.Data(map[string]any{"key": "uploads/a/v.mp4", "type": "video/mp4"})}, 0)
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "theirs", Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/u/p.jpg", "type": "image/jpeg"})}, 0)
	save := func(id string, o core.Outfit) int {
		return call(a, "PUT", "/api/admin/outfits/"+id, admin, "", map[string]any{"version": 0, "data": o}).Code
	}
	for _, bad := range []core.Outfit{{Title: "", ImageAssetID: "pic"}, {Title: "裙", ImageAssetID: "clip"}, {Title: "裙", ImageAssetID: "theirs"}, {Title: strings.Repeat("长", 41), ImageAssetID: "pic"}} {
		if code := save("bad", bad); code != 400 {
			t.Fatal("invalid outfit saved", bad, code)
		}
	}
	for i, c := range []string{"春季", "春季", "夏季"} {
		if code := save(fmt.Sprint("o", i), core.Outfit{Title: fmt.Sprint("服装", i), Category: c, Description: "白T + 牛仔裤", ImageAssetID: "pic", Published: true, Sort: i}); code != 200 {
			t.Fatal(code)
		}
	}
	_ = save("draft", core.Outfit{Title: "草稿", Category: "冬季", ImageAssetID: "pic"})
	if w := call(a, "PUT", "/api/admin/outfits/o0", one, "", map[string]any{}); w.Code < 400 {
		t.Fatal("a user saved an outfit")
	}
	var page struct {
		Items []outfitView `json:"items"`
		Total int          `json:"total"`
	}
	_ = json.Unmarshal(call(a, "GET", "/api/outfits?page=1&category=春季", one, "", nil).Body.Bytes(), &page)
	if page.Total != 2 || page.Items[0].ID != "o0" || page.Items[0].Image != "/media/uploads/a/pic.jpg" || page.Items[0].Description == "" {
		t.Fatalf("%+v", page)
	}
	_ = json.Unmarshal(call(a, "GET", "/api/outfits?ids=o2,draft,missing", one, "", nil).Body.Bytes(), &page)
	if page.Total != 1 || page.Items[0].ID != "o2" {
		t.Fatalf("favourites: %+v", page)
	}
	var cats []outfitCategory
	_ = json.Unmarshal(call(a, "GET", "/api/outfits/categories", one, "", nil).Body.Bytes(), &cats)
	if len(cats) != 2 || cats[0].Count+cats[1].Count != 3 {
		t.Fatalf("drafts counted: %+v", cats)
	}
	var pick outfitView
	if w := call(a, "GET", "/api/outfits/random?category=夏季", one, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &pick) != nil || pick.ID != "o2" {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "GET", "/api/outfits/random?category=秋季", one, "", nil); w.Code != 404 {
		t.Fatal("empty category", w.Code)
	}
	// 试穿: the user's own asset, the same one again; another user gets another.
	use := func(token, id string) core.Record {
		var row core.Record
		w := call(a, "POST", "/api/outfits/"+id+"/use", token, "", nil)
		_ = json.Unmarshal(w.Body.Bytes(), &row)
		if w.Code != 200 {
			row.ID = ""
		}
		return row
	}
	first := use(one, "o1")
	asset, err := a.Store.Get(t.Context(), "assets", first.ID)
	if first.ID == "" || err != nil || asset.Owner != "user-a" || !a.ownImage(t.Context(), first.ID, "user-a") {
		t.Fatal("no own asset", first, err)
	}
	if use(one, "o1").ID != first.ID || use(two, "o1").ID == first.ID {
		t.Fatal("asset not stable per user")
	}
	if use(one, "draft").ID != "" {
		t.Fatal("an unpublished outfit was used")
	}
	// Deleted outfits disappear for users.
	if w := call(a, "DELETE", "/api/admin/outfits/o2", admin, "", map[string]any{"version": 1}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "GET", "/api/outfits/random?category=夏季", one, "", nil); w.Code != 404 {
		t.Fatal("deleted outfit served", w.Code)
	}
}
