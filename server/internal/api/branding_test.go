package api

import (
	"context"
	"doubo/server/internal/media"
	"encoding/json"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBrandingIsPublicAndUsesOSSWithoutDatabaseAccess(t *testing.T) {
	a, _, _ := setup(t)
	dir := filepath.Join(a.Config.MediaDir, "brand")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(filepath.Join(dir, "doubo.png"))
	if err != nil {
		t.Fatal(err)
	}
	err = png.Encode(file, image.NewRGBA(image.Rect(0, 0, 4, 2)))
	file.Close()
	if err != nil {
		t.Fatal(err)
	}
	icons := media.NewBrandIcons(dir, configIconObjects{})
	a.Media = &media.Service{BrandIcons: icons}
	// Database failure must not remove the logo from the login page.
	a.Store = nil
	before := call(a, "GET", "/api/brand-icon", "", "", nil)
	if before.Code != 200 || before.Header().Get("Content-Type") != "image/png" {
		t.Fatal("local logo fallback unavailable", before.Code)
	}
	if count, err := icons.Sync(context.Background()); err != nil || count != 1 {
		t.Fatal(count, err)
	}
	response := call(a, "GET", "/api/branding", "", "", nil)
	var body struct {
		Icon string `json:"icon"`
	}
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &body) != nil || !strings.HasPrefix(body.Icon, "https://icons.test/system/brand/") {
		t.Fatal("anonymous branding did not return OSS logo", response.Code)
	}
	redirect := call(a, "GET", "/api/brand-icon", "", "", nil)
	if redirect.Code != 302 || redirect.Header().Get("Location") != body.Icon || redirect.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("favicon did not redirect to a fresh OSS URL")
	}
	a.Config.RequireActivation = true
	config := call(a, "GET", "/api/config", "", "", nil)
	var restricted struct {
		BrandIcon string `json:"brandIcon"`
		Models    []any  `json:"models"`
	}
	if config.Code != 200 || json.Unmarshal(config.Body.Bytes(), &restricted) != nil || restricted.BrandIcon != body.Icon || len(restricted.Models) != 0 {
		t.Fatal("branding must be visible without revealing restricted models")
	}
}
