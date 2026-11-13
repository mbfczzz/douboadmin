package media

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type urlIconStore struct {
	iconStore
	scheme string
}

func (s *urlIconStore) IconURL(ctx context.Context, key string) (string, error) {
	url, err := s.iconStore.IconURL(ctx, key)
	return strings.Replace(url, "https://", s.scheme, 1), err
}

func TestBuiltinIconURLsOnlyExposeConfirmedHTTPSObjects(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	for _, name := range []string{"good.png", "failed.png"} {
		if err := os.WriteFile(filepath.Join(dir, name), iconPNG(t), 0600); err != nil {
			t.Fatal(err)
		}
	}
	store := &urlIconStore{iconStore: iconStore{keys: map[string][]byte{}, failName: "failed.png"}, scheme: "https://"}
	icons := NewModelIcons(dir, store)
	if urls := icons.URLs(ctx); urls == nil || len(urls) != 0 || len(store.keys) != 0 {
		t.Fatal("reading URLs uploaded or exposed unsynchronized icons")
	}
	if count, err := icons.Sync(ctx); count != 1 || err == nil {
		t.Fatal(count, err)
	}
	path := "/media/model-icons/good.png"
	urls := icons.URLs(ctx)
	if len(urls) != 1 || !strings.HasPrefix(urls[path], "https://icons.test/system/model-icons/") {
		t.Fatal("only confirmed successful uploads should be published", urls)
	}
	delete(urls, path)
	if len(icons.URLs(ctx)) != 1 {
		t.Fatal("caller changed the internal mapping")
	}
	store.signErr = errors.New("sign unavailable")
	if len(icons.URLs(ctx)) != 0 {
		t.Fatal("signing errors exposed a fallback")
	}
	store.signErr = nil
	store.scheme = "http://"
	if len(icons.URLs(ctx)) != 0 {
		t.Fatal("insecure signatures exposed")
	}
}
