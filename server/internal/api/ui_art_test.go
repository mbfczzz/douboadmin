package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestUIArtServesOnlyNamedJPEGsWithLongCache(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "ui-art"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "ui-art", "mine-bg.jpg"), []byte("\xff\xd8\xff\xe0jpeg"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "secret.jpg"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := &Server{Config: Config{MediaDir: dir}}
	m := http.NewServeMux()
	m.HandleFunc("GET /api/ui-art/{name}", a.uiArtFile)
	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		m.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		return w
	}
	ok := get("/api/ui-art/mine-bg")
	if ok.Code != 200 || ok.Header().Get("Content-Type") != "image/jpeg" || ok.Header().Get("Cache-Control") == "" {
		t.Fatalf("art not served: %d %v", ok.Code, ok.Header())
	}
	for _, bad := range []string{"/api/ui-art/missing", "/api/ui-art/..%2Fsecret", "/api/ui-art/Mine_BG"} {
		if w := get(bad); w.Code != 404 {
			t.Fatalf("%s served: %d", bad, w.Code)
		}
	}
}
