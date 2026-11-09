package media

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/base64"
	"image"
	"image/png"
	"strings"
	"testing"
)

func TestSaveStoresBase64ImageResults(t *testing.T) {
	var buf bytes.Buffer
	_ = png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	s := &Service{Store: store.NewMemory(), Dir: t.TempDir()}
	j := core.NewJob("user", "inline-result", core.JobInput{Kind: "image", Model: "m", Prompt: "p"})
	out, err := s.Save(context.Background(), j, "data:;base64,"+base64.StdEncoding.EncodeToString(buf.Bytes()))
	if err != nil || !strings.HasPrefix(out, "asset:") {
		t.Fatal(out, err)
	}
	if _, err = s.Save(context.Background(), core.NewJob("user", "bad", j.Input), "data:;base64,not base64!"); err == nil {
		t.Fatal("invalid base64 accepted")
	}
}
