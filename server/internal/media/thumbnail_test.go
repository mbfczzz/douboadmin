package media

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"fmt"
	"io"
	"testing"
)

type thumbnailStore struct {
	key, kind string
	failure   bool
}

func (*thumbnailStore) Put(context.Context, string, io.Reader, string) error { return nil }
func (*thumbnailStore) URL(context.Context, string) (string, error)          { return "original", nil }
func (s *thumbnailStore) Thumbnail(_ context.Context, key, kind string) (string, error) {
	s.key, s.kind = key, kind
	if s.failure {
		return "", fmt.Errorf("fixture failure")
	}
	return "https://fixture.test/preview", nil
}

func TestThumbnailUsesStoredAssetKeyAndNeverProcessesUnknownURLs(t *testing.T) {
	s := store.NewMemory()
	objects := &thumbnailStore{}
	service := &Service{Store: s, Objects: objects}
	_, err := s.Put(t.Context(), "assets", core.Record{ID: "saved", Data: core.Data(Asset{Key: "results/result.mp4", Type: "video/mp4"})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	url, err := service.Thumbnail(t.Context(), "asset:saved", "video")
	if err != nil || url == "" || objects.key != "results/result.mp4" || objects.kind != "video" {
		t.Fatal(url, err, objects)
	}
	objects.key = ""
	for _, test := range []struct{ ref, kind string }{{"https://remote.test/result", "video"}, {"asset:saved", "chat"}} {
		url, err = service.Thumbnail(t.Context(), test.ref, test.kind)
		if err != nil || url != "" || objects.key != "" {
			t.Fatal(url, err, objects)
		}
	}
	objects.failure = true
	if _, err = service.Thumbnail(t.Context(), "asset:saved", "video"); err == nil {
		t.Fatal("signing failure lost")
	}
}
