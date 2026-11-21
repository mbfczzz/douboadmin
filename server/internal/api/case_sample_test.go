package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// 做同款 on a built-in case: its shipped photo becomes the user's own picture
// (the same one again); names outside the case set give nothing.
func TestCaseSampleIsTheUsersOwnPicture(t *testing.T) {
	a, one, two := setup(t)
	dir := filepath.Join(a.Config.MediaDir, "ui-art")
	_ = os.MkdirAll(dir, 0o755)
	for _, name := range []string{"case-ad-pan", "id-blue-suit", "mine-bg"} {
		_ = os.WriteFile(filepath.Join(dir, name+".jpg"), []byte("\xff\xd8 fixture"), 0o644)
	}
	use := func(token, name string) core.Record {
		var row core.Record
		if w := call(a, "POST", "/api/cases/"+name+"/sample", token, "", nil); w.Code == 200 {
			_ = json.Unmarshal(w.Body.Bytes(), &row)
		}
		return row
	}
	first := use(one, "case-ad-pan")
	if first.ID == "" || !a.ownImage(t.Context(), first.ID, "user-a") {
		t.Fatal("not the user's own picture", first)
	}
	var data map[string]any
	_ = json.Unmarshal(first.Data, &data)
	if data["url"] != "/media/ui-art/case-ad-pan.jpg" {
		t.Fatal(data)
	}
	if use(one, "case-ad-pan").ID != first.ID || use(two, "case-ad-pan").ID == first.ID {
		t.Fatal("asset not stable per user")
	}
	if use(one, "id-blue-suit").ID == "" {
		t.Fatal("the AI证件照 example photo")
	}
	for _, name := range []string{"mine-bg", "case-ad-none", "case-ad-..%2Fx"} {
		if use(one, name).ID != "" {
			t.Fatal("gave a picture for", name)
		}
	}
}
