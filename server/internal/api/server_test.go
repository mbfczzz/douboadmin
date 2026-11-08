package api

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func setup(t *testing.T) (*Server, string, string) {
	t.Helper()
	s := store.NewMemory()
	ss := NewSessions(nil)
	a := New(s, ss, Config{AdminUser: "admin", AdminPassword: "test-pass", MediaDir: t.TempDir(), WebOrigin: "http://localhost:5174", RelayURL: "https://relay.test", RelayKey: "test-key"})
	m := core.Model{ID: "demo-image", Key: "fixture-image", Name: "Test model", Kind: "image", Published: true, Available: true, Resolutions: []string{"1K"}, Ratios: []string{"1:1"}, Modes: []string{"t2i", "i2i"}}
	_, _ = s.Put(context.Background(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
	one, _ := ss.Create(context.Background(), "user-a", "user")
	two, _ := ss.Create(context.Background(), "user-b", "user")
	return a, one, two
}
func call(a *Server, method, path, token, key string, body any) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, bytes.NewReader(b))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}
func TestOwnershipAndIdempotency(t *testing.T) {
	a, one, two := setup(t)
	in := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "test", Resolution: "1K", Ratio: "1:1", Assets: []string{}}
	w := call(a, "POST", "/api/jobs", one, "same-key", in)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	var j core.Job
	_ = json.Unmarshal(w.Body.Bytes(), &j)
	if got := call(a, "GET", "/api/jobs/"+j.ID, two, "", nil); got.Code != 404 {
		t.Fatal("cross-user task leak", got.Code)
	}
	if got := call(a, "POST", "/api/jobs", one, "same-key", in); got.Code != 200 {
		t.Fatal("retry did not reuse task", got.Code)
	}
	in.Prompt = "changed"
	if got := call(a, "POST", "/api/jobs", one, "same-key", in); got.Code != 409 {
		t.Fatal("idempotency conflict missing", got.Code)
	}
	if got := call(a, "GET", "/api/admin/users", one, "", nil); got.Code != 403 {
		t.Fatal("user reached admin")
	}
	if got := call(a, "GET", "/api/jobs", "", "", nil); got.Code != 401 {
		t.Fatal("anonymous reached tasks")
	}
}
func TestSessionRevocationAndOrigin(t *testing.T) {
	a, token, _ := setup(t)
	w := call(a, "POST", "/api/auth/logout", token, "", nil)
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	if call(a, "GET", "/api/jobs", token, "", nil).Code != 401 {
		t.Fatal("revoked session accepted")
	}
	r := httptest.NewRequest(http.MethodPost, "/api/admin/login", bytes.NewBufferString(`{"username":"admin","password":"test-pass"}`))
	r.Header.Set("Origin", "https://attacker.example")
	w = httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("cross-origin admin request accepted")
	}
}
func TestAdminVersionConflict(t *testing.T) {
	a, _, _ := setup(t)
	token, _ := a.Sessions.Create(context.Background(), "admin", "admin")
	template := core.Template{Title: "Test template", Kind: "image", Prompt: "test", Cover: "https://example.test/cover.jpg", GenerationOptions: core.GenerationOptions{Model: "demo-image", Resolution: "1K", Ratio: "1:1"}}
	body := map[string]any{"version": 0, "data": template}
	w := call(a, "PUT", "/api/admin/templates/test", token, "", body)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "PUT", "/api/admin/templates/test", token, "", body)
	if w.Code != 409 {
		t.Fatal("stale write accepted")
	}
}
func TestRejectForeignAsset(t *testing.T) {
	a, one, _ := setup(t)
	_, _ = a.Store.Put(context.Background(), "assets", core.Record{ID: "other-asset", Owner: "user-b", Data: core.Data(map[string]string{"type": "image/jpeg"})}, 0)
	in := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "test", Resolution: "1K", Ratio: "1:1", Assets: []string{"other-asset"}}
	if call(a, "POST", "/api/jobs", one, "asset-check", in).Code != 400 {
		t.Fatal("foreign asset accepted")
	}
}
func TestPrivateAsset(t *testing.T) {
	a, one, _ := setup(t)
	_, _ = a.Store.Put(context.Background(), "assets", core.Record{ID: "asset", Owner: "user-b", Data: core.Data(map[string]string{"key": "uploads/test"})}, 0)
	if call(a, "GET", "/api/assets/asset", one, "", nil).Code != 404 {
		t.Fatal("foreign asset readable")
	}
}
