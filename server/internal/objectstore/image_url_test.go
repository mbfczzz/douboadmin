package objectstore

import (
	"context"
	"net/url"
	"strings"
	"testing"
)

func TestImageURLResizesAndReusesItsSignature(t *testing.T) {
	s := New("cn-shanghai", "fixture-bucket", "fixture-key", "fixture-secret")
	a, err := s.ImageURL(context.Background(), "assets/cover.png", 720)
	if err != nil {
		t.Fatal(err)
	}
	q, _ := url.Parse(a)
	if p := q.Query().Get("x-oss-process"); !strings.HasPrefix(p, "image/resize,m_lfit,w_720,limit_1/") || strings.Contains(p, "format,") {
		t.Fatal(p)
	}
	if q.Query().Get("x-oss-signature") == "" {
		t.Fatal("cover URL is not signed")
	}
	b, _ := s.ImageURL(context.Background(), "assets/cover.png", 720)
	if a != b {
		t.Fatal("cover signature not reused, client image cache would miss")
	}
	c, _ := s.ImageURL(context.Background(), "assets/cover.png", 1080)
	if c == a {
		t.Fatal("different widths share a URL")
	}
	rotated := New("cn-shanghai", "fixture-bucket", "rotated-key", "rotated-secret")
	if r, _ := rotated.ImageURL(context.Background(), "assets/cover.png", 720); r == a {
		t.Fatal("a rotated store reused a URL signed with the old key")
	}
	if _, err := s.ImageURL(context.Background(), "assets/cover.png", 9000); err == nil {
		t.Fatal("unbounded width accepted")
	}
}
