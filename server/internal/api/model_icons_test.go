package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type configIconObjects struct{}

func (configIconObjects) EnsureIcon(context.Context, string, io.Reader) error { return nil }
func (configIconObjects) IconURL(_ context.Context, key string) (string, error) {
	return "https://icons.test/" + key + "?signature=fixture", nil
}

func TestPublicConfigUsesUploadedOSSModelIconsWithoutChangingStoredSettings(t *testing.T) {
	a, _, _ := setup(t)
	ctx := context.Background()
	row, _ := a.Store.Get(ctx, "models", "demo-image")
	var model core.Model
	_ = json.Unmarshal(row.Data, &model)
	model.Settings.Icon = "/media/model-icons/openai.png"
	row.Data = core.Data(model)
	if _, err := a.Store.Put(ctx, "models", row, row.Version); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	file, err := os.Create(filepath.Join(dir, "openai.png"))
	if err != nil {
		t.Fatal(err)
	}
	encodeErr := png.Encode(file, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	file.Close()
	if encodeErr != nil {
		t.Fatal(encodeErr)
	}
	icons := media.NewModelIcons(dir, configIconObjects{})
	a.Media = &media.Service{ModelIcons: icons}
	readIcon := func() string {
		t.Helper()
		response := call(a, "GET", "/api/config", "", "", nil)
		var body struct {
			Models []core.Model `json:"models"`
		}
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &body) != nil || len(body.Models) != 1 {
			t.Fatal("invalid model config", response.Code)
		}
		return body.Models[0].Icon
	}
	if readIcon() != model.Settings.Icon {
		t.Fatal("missing local fallback before synchronization")
	}
	if _, err := icons.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(readIcon(), "https://icons.test/system/model-icons/") {
		t.Fatal("public API did not return direct OSS address")
	}
	stored, _ := a.Store.Get(ctx, "models", model.ID)
	var saved core.Model
	_ = json.Unmarshal(stored.Data, &saved)
	if saved.Settings.Icon != model.Settings.Icon || saved.Icon != model.Icon || stored.Version != row.Version+1 {
		t.Fatal("config read changed persisted model settings")
	}
}
