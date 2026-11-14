package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
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
	files, _ := filepath.Glob(filepath.Join(dir, "*.jpg"))
	count, err := art.Sync(t.Context())
	if err != nil || count != len(files) || count < 24 || len(art.URLs(t.Context())) != count {
		t.Fatal(count, len(files), err)
	}
}

// pruningStore also implements PruneUIArt, as objectstore.OSS does.
type pruningStore struct {
	iconStore
	pruned int
}

func (s *pruningStore) PruneUIArt(_ context.Context, keep map[string]bool) (int, error) {
	removed := 0
	for key := range s.keys {
		if strings.HasPrefix(key, "system/ui-art/") && !keep[key] {
			delete(s.keys, key)
			removed++
		}
	}
	s.pruned++
	return removed, nil
}

func TestUIArtSyncRemovesReplacedPicturesOnlyAfterAFullSync(t *testing.T) {
	dir := t.TempDir()
	var data bytes.Buffer
	if err := jpeg.Encode(&data, image.NewRGBA(image.Rect(0, 0, 3, 2)), nil); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "mine-bg.jpg")
	if err := os.WriteFile(file, data.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	store := &pruningStore{iconStore: iconStore{keys: map[string][]byte{"system/ui-art/old/wallet-bg.jpg": {1}}}}
	art := NewUIArt(dir, store)
	if _, err := art.Sync(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, append(data.Bytes(), '2'), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := art.Sync(t.Context()); err != nil {
		t.Fatal(err)
	}
	// Only the current picture is left: the replaced one and the stale one are gone.
	key := fmt.Sprintf("system/ui-art/%x/mine-bg.jpg", sha256.Sum256(append(data.Bytes(), '2')))
	if len(store.keys) != 1 || store.keys[key] == nil {
		t.Fatal("old UI art left in OSS", store.keys)
	}
	// A failed picture keeps everything: nothing is deleted on a partial sync.
	pruned := store.pruned
	if err := os.WriteFile(filepath.Join(dir, "broken.jpg"), []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := art.Sync(t.Context()); err == nil || store.pruned != pruned {
		t.Fatal("partial sync must not prune")
	}
}
