package media

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type iconStore struct {
	keys      map[string][]byte
	uploadErr error
	signErr   error
	failName  string
}

func (s *iconStore) EnsureIcon(_ context.Context, key string, body io.Reader) error {
	if s.failName != "" && strings.HasSuffix(key, "/"+s.failName) {
		return errors.New("icon upload failed")
	}
	if s.uploadErr != nil {
		return s.uploadErr
	}
	data, _ := io.ReadAll(body)
	s.keys[key] = data
	return nil
}

func iconPNG(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func (s *iconStore) IconURL(_ context.Context, key string) (string, error) {
	return "https://icons.test/" + key + "?signature=fixture", s.signErr
}

func TestModelIconsPublishOnlyBuiltinsAndUseContentAddressedKeys(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	data := iconPNG(t)
	for name, body := range map[string][]byte{"openai.png": data, "SOURCE.md": []byte("source"), "other.jpg": []byte("image")} {
		if err := os.WriteFile(filepath.Join(dir, name), body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	store := &iconStore{keys: map[string][]byte{}}
	icons := NewModelIcons(dir, store)
	path := "/media/model-icons/openai.png"
	if icons.URL(ctx, path) != path {
		t.Fatal("unsynchronized icon must retain local fallback")
	}
	for range 2 {
		if count, err := icons.Sync(ctx); err != nil || count != 1 {
			t.Fatal(count, err)
		}
	}
	if len(store.keys) != 1 {
		t.Fatal("unchanged icon keys must be stable")
	}
	for key, got := range store.keys {
		if !strings.HasPrefix(key, "system/model-icons/") || !strings.HasSuffix(key, "/openai.png") || !bytes.Equal(got, data) {
			t.Fatal("wrong object or content", key)
		}
	}
	url := icons.URL(ctx, path)
	if !strings.HasPrefix(url, "https://icons.test/system/model-icons/") {
		t.Fatal("missing direct HTTPS icon")
	}
	if err := os.WriteFile(filepath.Join(dir, "openai.png"), append(data, '2'), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := icons.Sync(ctx); err != nil || icons.URL(ctx, path) == url || len(store.keys) != 2 {
		t.Fatal("changed image must get a new immutable URL", err)
	}
	for _, input := range []string{"字", "", "https://custom.test/logo.png", "/media/other.png", "/media/model-icons/../openai.png", "/media/model-icons/missing.png"} {
		if icons.URL(ctx, input) != input {
			t.Fatal("rewrote unknown icon", input)
		}
	}
	store.signErr = errors.New("signing unavailable")
	if icons.URL(ctx, path) != path {
		t.Fatal("signing failure must retain fallback")
	}
}

func TestModelIconsFailureDoesNotExposeMissingObjects(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	path := "/media/model-icons/openai.png"
	store := &iconStore{keys: map[string][]byte{}, uploadErr: errors.New("access denied")}
	icons := NewModelIcons(dir, store)
	if _, err := icons.Sync(ctx); err == nil {
		t.Fatal("missing package assets must report sync failure")
	}
	file := filepath.Join(dir, "openai.png")
	if err := os.WriteFile(file, iconPNG(t), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := icons.Sync(ctx); err == nil || icons.URL(ctx, path) != path {
		t.Fatal("failed upload must not publish an OSS URL")
	}
	store.uploadErr = nil
	if _, err := icons.Sync(ctx); err != nil || icons.URL(ctx, path) == path {
		t.Fatal("retry did not recover", err)
	}
	if err := os.WriteFile(file, []byte("not a PNG"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := icons.Sync(ctx); err == nil {
		t.Fatal("invalid built-in file was uploaded")
	}
}

func TestModelIconsContinuePastInvalidAndFailedIcons(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	for _, name := range []string{"a.png", "b.png", "c.png"} {
		data := iconPNG(t)
		if name == "a.png" {
			data = []byte("\x89PNG\r\n\x1a\ntruncated")
		}
		if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	store := &iconStore{keys: map[string][]byte{}, failName: "b.png"}
	icons := NewModelIcons(dir, store)
	if count, err := icons.Sync(ctx); err == nil || count != 1 {
		t.Fatal("one broken icon blocked healthy icons", count, err)
	}
	if icons.URL(ctx, "/media/model-icons/c.png") == "/media/model-icons/c.png" {
		t.Fatal("healthy icon unavailable")
	}
	if len(store.keys) != 1 {
		t.Fatal("invalid or failed icon published")
	}
	if err := os.WriteFile(filepath.Join(dir, "a.png"), iconPNG(t), 0600); err != nil {
		t.Fatal(err)
	}
	store.failName = ""
	if count, err := icons.Sync(ctx); err != nil || count != 3 {
		t.Fatal("partial synchronization did not recover", count, err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if count, err := icons.Sync(cancelled); count != 0 || !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled synchronization continued", count, err)
	}
}
