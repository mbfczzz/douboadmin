package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"testing"
)

func TestPermanentModelDeleteRequiresAdminDeletedStateAndCurrentSnapshot(t *testing.T) {
	a, admin := modelServer(t)
	if w := call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	id := core.Digest("image-live")[:32]
	row, _ := a.Store.Get(t.Context(), "models", id)
	path := "/api/admin/models/" + id + "/permanent"
	body := map[string]any{"version": row.Version, "createdAt": row.CreatedAt}
	if w := call(a, "DELETE", path, "", "", body); w.Code != 401 {
		t.Fatal("anonymous deletion accepted")
	}
	user, _ := a.Sessions.Create(t.Context(), "purge-user", "user")
	if w := call(a, "DELETE", path, user, "", body); w.Code != 403 {
		t.Fatal("user deletion accepted")
	}
	if w := call(a, "DELETE", path, admin, "", body); w.Code != 409 {
		t.Fatal("active model removed", w.Code)
	}
	if w := call(a, "DELETE", "/api/admin/models/"+id, admin, "", map[string]any{"version": row.Version}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := call(a, "DELETE", path, admin, "", body); w.Code != 409 {
		t.Fatal("stale snapshot accepted")
	}
	row, _ = a.Store.Get(t.Context(), "models", id)
	if w := call(a, "DELETE", path, admin, "", map[string]any{"version": row.Version}); w.Code != 400 {
		t.Fatal("missing generation accepted")
	}
	body["version"] = row.Version
	if w := call(a, "DELETE", path, admin, "", body); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err := a.Store.Get(t.Context(), "models", id); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("model was only hidden")
	}
	// A later upstream sync may import it again as a fresh configuration.
	w := call(a, "POST", "/api/admin/models/sync", admin, "", nil)
	var stats map[string]int
	if json.Unmarshal(w.Body.Bytes(), &stats) != nil || stats["created"] != 1 {
		t.Fatal(w.Body.String())
	}
	model, err := a.model(t.Context(), id)
	if err != nil || model.Deleted {
		t.Fatal("re-import failed", err)
	}
}
