package media

import (
	"bytes"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestMultiImageStorageHasIndependentRetrySafeAssets(t *testing.T) {
	var body bytes.Buffer
	_ = png.Encode(&body, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	calls := map[string]int{}
	failThird := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls[r.URL.Path]++
		if r.URL.Path == "/3" && failThird {
			w.WriteHeader(503)
			return
		}
		_, _ = w.Write(body.Bytes())
	}))
	defer server.Close()
	s := &Service{Store: store.NewMemory(), Dir: t.TempDir(), HTTP: server.Client()}
	j := core.NewJob("owner", "multi-image", core.JobInput{Kind: "image"})
	raw := core.PackResults([]string{server.URL + "/1", server.URL + "/2", server.URL + "/3", server.URL + "/4"})
	if _, err := s.Save(t.Context(), j, raw); err == nil {
		t.Fatal("partial group reported complete")
	}
	failThird = false
	out, err := s.Save(t.Context(), j, raw)
	if err != nil {
		t.Fatal(err)
	}
	refs, _ := core.ResultRefs(out)
	if len(refs) != 4 || refs[0] != "asset:"+core.Digest(j.ID + ":result")[:32] {
		t.Fatal(refs)
	}
	assets, _ := s.Store.List(t.Context(), "assets", "owner")
	if len(assets) != 4 {
		t.Fatal("overwrote an image slot", len(assets))
	}
	urls, err := s.ResultURLs(t.Context(), out)
	if err != nil || len(urls) != 4 || urls[0] == urls[1] {
		t.Fatal(urls, err)
	}
	if again, err := s.Save(t.Context(), j, raw); err != nil || again != out {
		t.Fatal(again, err)
	}
	if !reflect.DeepEqual(calls, map[string]int{"/1": 1, "/2": 1, "/3": 2, "/4": 1}) {
		t.Fatal("redownloaded saved outputs", calls)
	}
}
