package objectstore

import (
	"context"
	"net/url"
	"strings"
	"testing"
)

func TestThumbnailProcessingIsIncludedInPrivateSignature(t *testing.T) {
	s := New("cn-shanghai", "fixture-bucket", "fixture-key", "fixture-secret")
	for _, kind := range []string{"image", "video", "mix"} {
		u, err := s.Thumbnail(context.Background(), "results/fixture/test.jpg", kind)
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := url.Parse(u)
		if err != nil {
			t.Fatal(err)
		}
		q := parsed.Query()
		process := q.Get("x-oss-process")
		if kind == "image" && !strings.HasPrefix(process, "image/resize,") {
			t.Fatal(process)
		}
		if kind != "image" && !strings.HasPrefix(process, "video/snapshot,t_0,") {
			t.Fatal(process)
		}
		if q.Get("x-oss-signature") == "" || q.Get("x-oss-expires") != "900" {
			t.Fatal("thumbnail missing short-lived signature")
		}
	}
	if _, err := s.Thumbnail(context.Background(), "results/file", "chat"); err == nil {
		t.Fatal("nonvisual type accepted")
	}
}
