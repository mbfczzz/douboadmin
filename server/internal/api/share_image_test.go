package api

import (
	"context"
	"errors"
	"fmt"
	"image/png"
	"io"
	"strings"
	"testing"
)

type qrObjects struct {
	keys        map[string]bool
	puts, signs int
	fail        bool
}

func (o *qrObjects) Put(context.Context, string, io.Reader, string) error {
	return errors.New("must use immutable publication")
}
func (o *qrObjects) EnsureQR(_ context.Context, key string, body io.Reader) error {
	if o.fail {
		return errors.New("fixture provider credentials must not escape")
	}
	if _, err := png.Decode(body); err != nil {
		return err
	}
	if !o.keys[key] {
		o.keys[key] = true
		o.puts++
	}
	return nil
}
func (o *qrObjects) URL(_ context.Context, key string) (string, error) {
	o.signs++
	return fmt.Sprintf("https://private-oss.test/%s?signature=%d", key, o.signs), nil
}

func TestShareImagesArePrivateImmutableAndResigned(t *testing.T) {
	a, _, _ := setup(t)
	o := &qrObjects{keys: map[string]bool{}}
	a.Objects = o
	u, err := a.shareQR(context.Background(), "ABCD2345")
	if err != nil || !strings.HasPrefix(u, "https://private-oss.test/system/share-codes/") || strings.Contains(u, "ABCD2345") {
		t.Fatal("invalid private QR URL", err)
	}
	next, err := a.shareQR(context.Background(), "ABCD2345")
	if err != nil || next == u || o.puts != 1 || o.signs != 2 {
		t.Fatal("QR was not reused and freshly signed")
	}
	if _, err = a.shareQR(context.Background(), "WXYZ6789"); err != nil || o.puts != 2 {
		t.Fatal("new code must use different immutable content")
	}
	o.fail = true
	_, err = a.shareQR(context.Background(), "PRMO2345")
	if err == nil || strings.Contains(err.Error(), "credentials") {
		t.Fatal("storage failure must be sanitized")
	}
}

func TestShareImageInlineFallbackIsDevelopmentOnly(t *testing.T) {
	a, _, _ := setup(t)
	u, err := a.shareQR(context.Background(), "ABCD2345")
	if err != nil || !strings.HasPrefix(u, "data:image/png;base64,") {
		t.Fatal("development QR fallback unavailable")
	}
	a.Config.Production = true
	if _, err = a.shareQR(context.Background(), "ABCD2345"); err == nil {
		t.Fatal("production without OSS should not silently return inline image")
	}
}
