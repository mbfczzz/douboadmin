package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Shipped outfit pictures fill the library once at startup: published,
// shown to users; a second start adds nothing, a deleted one stays deleted,
// and an administrator can edit one without re-uploading its picture.
func TestBuiltinOutfitsFillTheLibraryOnce(t *testing.T) {
	a, one, _ := setup(t)
	dir := filepath.Join(a.Config.MediaDir, "outfits")
	_ = os.MkdirAll(dir, 0o755)
	for _, id := range []string{"spring-trench", "winter-coat"} {
		_ = os.WriteFile(filepath.Join(dir, id+".jpg"), []byte("\xff\xd8 fixture "+id), 0o644)
	}
	if n, err := a.seedBuiltinOutfits(t.Context()); err != nil || n != 2 {
		t.Fatal(n, err)
	}
	var page struct {
		Items []outfitView `json:"items"`
		Total int          `json:"total"`
	}
	_ = json.Unmarshal(call(a, "GET", "/api/outfits?page=1", one, "", nil).Body.Bytes(), &page)
	if page.Total != 2 || page.Items[0].ID != "default-spring-trench" || page.Items[0].Image != "/media/outfits/spring-trench.jpg" || page.Items[0].Category != "春季" {
		t.Fatalf("%+v", page)
	}
	if n, _ := a.seedBuiltinOutfits(t.Context()); n != 0 {
		t.Fatal("added twice", n)
	}
	// 试穿 with it works like any outfit.
	if w := call(a, "POST", "/api/outfits/default-winter-coat/use", one, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	row, _ := a.Store.Get(t.Context(), "outfits", "default-winter-coat")
	var o core.Outfit
	_ = json.Unmarshal(row.Data, &o)
	o.Title = "驼色大衣"
	if w := call(a, "PUT", "/api/admin/outfits/default-winter-coat", admin, "", map[string]any{"version": row.Version, "data": o}); w.Code != 200 {
		t.Fatal("editing a built-in outfit", w.Code, w.Body.String())
	}
	row, _ = a.Store.Get(t.Context(), "outfits", "default-spring-trench")
	if w := call(a, "DELETE", "/api/admin/outfits/default-spring-trench", admin, "", map[string]any{"version": row.Version}); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if n, _ := a.seedBuiltinOutfits(t.Context()); n != 0 {
		t.Fatal("a deleted built-in outfit came back")
	}
}
