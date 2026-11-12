package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"fmt"
	"io"
	"testing"
)

type thumbnailObjects struct {
	fail  bool
	calls int
}

func (*thumbnailObjects) Put(context.Context, string, io.Reader, string) error { return nil }
func (*thumbnailObjects) URL(context.Context, string) (string, error) {
	return "https://fixture.test/original", nil
}
func (s *thumbnailObjects) Thumbnail(context.Context, string, string) (string, error) {
	s.calls++
	if s.fail {
		return "", fmt.Errorf("fixture thumbnail error")
	}
	return "https://fixture.test/signed-small", nil
}

func TestJobThumbnailDecoratesCompletedAuthorizedResults(t *testing.T) {
	a, _, _ := setup(t)
	objects := &thumbnailObjects{}
	a.Media = &media.Service{Store: a.Store, Objects: objects}
	_, err := a.Store.Put(t.Context(), "assets", core.Record{ID: "thumbnail-result", Data: core.Data(media.Asset{Key: "results/image.jpg", Type: "image/jpeg"})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, scenario := range []struct {
		role, status string
		fail, want   bool
	}{
		{"admin", "succeeded", false, true},
		{"user", "succeeded", false, true},
		{"guest", "succeeded", false, false},
		{"admin", "running", false, false},
		{"admin", "succeeded", true, false},
	} {
		objects.fail = scenario.fail
		j := core.Job{ID: "job-one", UserID: "user-a", Status: scenario.status, Input: core.JobInput{Kind: "image", Model: "demo-image"}, Result: "asset:thumbnail-result"}
		ctx := context.WithValue(t.Context(), identityKey, Identity{Role: scenario.role, ID: "user-a"})
		a.presentJob(ctx, &j)
		if (j.ThumbnailURL != "") != scenario.want || j.Result != "https://fixture.test/original" {
			t.Fatal(scenario, j)
		}
		if scenario.role == "user" {
			other := context.WithValue(t.Context(), identityKey, Identity{Role: "user", ID: "other-user"})
			a.presentJob(other, &j)
			if j.ThumbnailURL != "" {
				t.Fatal("thumbnail was exposed to another user")
			}
		}
	}
}
