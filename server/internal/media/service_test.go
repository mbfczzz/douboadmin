package media

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResultTransferIsDurableAndIdempotent(t *testing.T) {
	var payload bytes.Buffer
	if err := png.Encode(&payload, image.NewRGBA(image.Rect(0, 0, 4, 4))); err != nil {
		t.Fatal(err)
	}
	hits := 0
	up := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++; _, _ = w.Write(payload.Bytes()) }))
	defer up.Close()
	s := &Service{Store: store.NewMemory(), Dir: t.TempDir(), HTTP: up.Client()}
	j := core.NewJob("owner", "key", core.JobInput{Kind: "image"})
	result, err := s.Save(context.Background(), j, up.URL)
	if err != nil || !strings.HasPrefix(result, "asset:") {
		t.Fatal(result, err)
	}
	u, err := s.URL(context.Background(), result)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(s.Dir, filepath.FromSlash(strings.TrimPrefix(u, "/media/")))
	b, err := os.ReadFile(file)
	if err != nil || !bytes.Equal(b, payload.Bytes()) {
		t.Fatal("result not persisted", err)
	}
	again, err := s.Save(context.Background(), j, up.URL)
	if err != nil || again != result || hits != 1 {
		t.Fatal("recovery redownloaded an already saved result", hits, err)
	}
}

func TestResultDownloadRejectsPrivateDestinations(t *testing.T) {
	hits := 0
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++ }))
	defer up.Close()
	if _, err := PublicClient().Get(up.URL); err == nil {
		t.Fatal("loopback was allowed")
	}
	if hits != 0 {
		t.Fatal("private service contacted")
	}
}

func TestNonMediaOutputCannotBecomeAWork(t *testing.T) {
	up := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("<html>not an image</html>")) }))
	defer up.Close()
	s := &Service{Store: store.NewMemory(), Dir: t.TempDir(), HTTP: up.Client()}
	if _, err := s.Save(context.Background(), core.NewJob("owner", "key", core.JobInput{Kind: "image"}), up.URL); err == nil {
		t.Fatal("non-media was saved")
	}
}
