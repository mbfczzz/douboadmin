package api

import (
	"context"
	"doubo/server/internal/media"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type brandingIconObjects struct {
	configIconObjects
	fail bool
}

func (s *brandingIconObjects) IconURL(ctx context.Context, key string) (string, error) {
	if s.fail {
		return "", errors.New("cannot sign")
	}
	return s.configIconObjects.IconURL(ctx, key)
}

func TestBrandingPublishesModelIconMapWithoutDatabaseOrUploads(t *testing.T) {
	a, _, _ := setup(t)
	dir := t.TempDir()
	file, err := os.Create(filepath.Join(dir, "openai.png"))
	if err != nil {
		t.Fatal(err)
	}
	err = png.Encode(file, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	file.Close()
	if err != nil {
		t.Fatal(err)
	}
	objects := &brandingIconObjects{}
	icons := media.NewModelIcons(dir, objects)
	a.Media = &media.Service{ModelIcons: icons}
	a.Store = nil
	read := func() map[string]string {
		t.Helper()
		res := call(a, "GET", "/api/branding", "", "", nil)
		var body struct {
			Icon       string            `json:"icon"`
			ModelIcons map[string]string `json:"modelIcons"`
		}
		if res.Code != 200 || json.Unmarshal(res.Body.Bytes(), &body) != nil || body.ModelIcons == nil {
			t.Fatal("invalid public branding response", res.Code)
		}
		if body.Icon != projectIcon || res.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("branding compatibility or fresh signature policy changed")
		}
		return body.ModelIcons
	}
	if len(read()) != 0 {
		t.Fatal("unsynchronized model icon was exposed")
	}
	if n, err := icons.Sync(context.Background()); n != 1 || err != nil {
		t.Fatal(n, err)
	}
	urls := read()
	if len(urls) != 1 || !strings.HasPrefix(urls["/media/model-icons/openai.png"], "https://icons.test/system/model-icons/") {
		t.Fatal("missing synchronized HTTPS model icon", urls)
	}
	objects.fail = true
	if len(read()) != 0 {
		t.Fatal("failed signatures must not expose local image fallbacks")
	}
}
