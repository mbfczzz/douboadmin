package media

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

func TestUIArtUsesOriginalJPEGContentAndNewKeysWhenChanged(t *testing.T) {
	dir := t.TempDir()
	var data bytes.Buffer
	if err := jpeg.Encode(&data, image.NewRGBA(image.Rect(0, 0, 3, 2)), nil); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "mine-bg.jpg")
	if err := os.WriteFile(file, data.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	store := &iconStore{keys: map[string][]byte{}}
	art := NewUIArt(dir, store)
	for range 2 {
		if n, err := art.Sync(t.Context()); n != 1 || err != nil {
			t.Fatal(n, err)
		}
	}
	key := fmt.Sprintf("system/ui-art/%x/mine-bg.jpg", sha256.Sum256(data.Bytes()))
	if len(store.keys) != 1 || !bytes.Equal(store.keys[key], data.Bytes()) {
		t.Fatal("JPEG changed or key is unstable")
	}
	old := art.URL(t.Context(), "/media/ui-art/mine-bg.jpg")
	if err := os.WriteFile(file, append(data.Bytes(), '2'), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := art.Sync(t.Context()); err != nil {
		t.Fatal(err)
	}
	if len(store.keys) != 2 || art.URL(t.Context(), "/media/ui-art/mine-bg.jpg") == old {
		t.Fatal("new image overwrote the old object")
	}
	if err := os.WriteFile(file, iconPNG(t), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := art.Sync(t.Context()); err == nil {
		t.Fatal("PNG disguised as JPEG accepted")
	}
	if err := os.WriteFile(file, make([]byte, 160*1024+1), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := art.Sync(t.Context()); err == nil {
		t.Fatal("oversized decoration accepted")
	}
}

func TestAllPackagedUIArtCanBeSynchronized(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "media", "ui-art")
	store := &iconStore{keys: map[string][]byte{}}
	art := NewUIArt(dir, store)
	count, err := art.Sync(t.Context())
	if err != nil || count != 15 || len(art.URLs(t.Context())) != count {
		t.Fatal(count, err)
	}
}
