package api

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"doubo/server/internal/media"
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

type artObjects struct {
	puts, signs int
	fail        bool
}

func (s *artObjects) EnsureIcon(_ context.Context, _ string, body io.Reader) error {
	s.puts++
	_, err := io.Copy(io.Discard, body)
	return err
}

func (s *artObjects) IconURL(_ context.Context, key string) (string, error) {
	s.signs++
	if s.fail {
		return "", errors.New("signing failed")
	}
	return fmt.Sprintf("https://bucket.test/%s?signature=%d", key, s.signs), nil
}

func TestUIArtRedirectsOnlyConfirmedObjectsAndDoesNotCacheSignedURLs(t *testing.T) {
	dir := t.TempDir()
	artDir := filepath.Join(dir, "ui-art")
	if err := os.MkdirAll(artDir, 0755); err != nil {
		t.Fatal(err)
	}
	var data bytes.Buffer
	if err := jpeg.Encode(&data, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(artDir, "mine-bg.jpg"), data.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	objects := &artObjects{}
	art := media.NewUIArt(artDir, objects)
	a := &Server{Config: Config{MediaDir: dir}, Media: &media.Service{UIArt: art}}
	m := http.NewServeMux()
	m.HandleFunc("GET /api/ui-art/{name}", a.uiArtFile)
	get := func(name string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		m.ServeHTTP(w, httptest.NewRequest("GET", "/api/ui-art/"+name+"?v=2", nil))
		return w
	}
	w := get("mine-bg")
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" || objects.puts != 0 {
		t.Fatal("pending sync must serve an uncached local fallback", w.Code)
	}
	if n, err := art.Sync(t.Context()); n != 1 || err != nil {
		t.Fatal(n, err)
	}
	var previous string
	for range 2 {
		w = get("mine-bg")
		location := w.Header().Get("Location")
		if w.Code != 302 || w.Header().Get("Cache-Control") != "no-store" || location == previous || location == "" {
			t.Fatal("signed redirect was missing or reused", w.Code, w.Header())
		}
		previous = location
	}
	if objects.puts != 1 {
		t.Fatal("image requests must not upload")
	}
	// /config hands phones the HTTPS address directly (no HTTP redirect).
	if urls := a.uiArtURLs(t.Context()); len(urls) != 1 || !strings.HasPrefix(urls["mine-bg"], "https://bucket.test/") {
		t.Fatal("config art map", urls)
	}
	if w = get("missing"); w.Code != 404 || w.Header().Get("Location") != "" {
		t.Fatal("missing art was signed")
	}
	objects.fail = true
	if urls := a.uiArtURLs(t.Context()); len(urls) != 0 {
		t.Fatal("failed signatures must be left out", urls)
	}
	w = get("mine-bg")
	if w.Code != 200 || !bytes.Equal(w.Body.Bytes(), data.Bytes()) || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("signing failure must retain local image")
	}
}
