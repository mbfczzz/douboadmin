package api

import (
	"bytes"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// shapedMP4 is the smallest file MP4Shape reads: mdat first, then a moov
// whose one track is w×h.
func shapedMP4(w, h uint32) []byte {
	box := func(typ string, payload []byte) []byte {
		return append(append(binary.BigEndian.AppendUint32(nil, uint32(8+len(payload))), typ...), payload...)
	}
	tkhd := make([]byte, 84)
	binary.BigEndian.PutUint32(tkhd[40:], 1<<16)
	binary.BigEndian.PutUint32(tkhd[56:], 1<<16)
	binary.BigEndian.PutUint32(tkhd[76:], w<<16)
	binary.BigEndian.PutUint32(tkhd[80:], h<<16)
	return append(box("mdat", make([]byte, 200<<10)), box("moov", box("trak", box("tkhd", tkhd)))...)
}

// The original's size comes from what was recorded, else from its header
// (read in ranges from object storage, or from disk), and is then kept.
func TestRemakeShapeReadsAndKeepsTheOriginalsSize(t *testing.T) {
	a, _, _ := setup(t)
	ctx := t.Context()
	if _, err := a.Store.Put(ctx, "assets", core.Record{ID: "known", Data: core.Data(media.Asset{Key: "k", Type: "video/mp4", Width: 720, Height: 1280})}, 0); err != nil {
		t.Fatal(err)
	}
	if w, h := a.remakeShape(ctx, "asset:known"); w != 720 || h != 1280 {
		t.Fatal(w, h)
	}
	file := shapedMP4(1440, 1080)
	path := filepath.Join(a.Config.MediaDir, "imports", "v.mp4")
	_ = os.MkdirAll(filepath.Dir(path), 0700)
	_ = os.WriteFile(path, file, 0600)
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "disk", Data: core.Data(media.Asset{Key: "imports/v.mp4", Type: "video/mp4", Size: int64(len(file))})}, 0)
	if w, h := a.remakeShape(ctx, "asset:disk"); w != 1440 || h != 1080 {
		t.Fatal(w, h)
	}
	row, _ := a.Store.Get(ctx, "assets", "disk")
	var kept media.Asset
	if json.Unmarshal(row.Data, &kept) != nil || kept.Width != 1440 || kept.Height != 1080 {
		t.Fatal("not kept", string(row.Data))
	}
	if w, h := a.remakeShape(ctx, "asset:missing"); w != 0 || h != 0 {
		t.Fatal(w, h)
	}
}

func TestRangeFileReadsOnlyWhatTheHeaderNeeds(t *testing.T) {
	file := shapedMP4(1080, 1920)
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		http.ServeContent(w, r, "v.mp4", time.Time{}, bytes.NewReader(file))
	}))
	defer server.Close()
	f := &rangeFile{ctx: t.Context(), url: server.URL, size: int64(len(file))}
	if w, h, err := media.MP4Shape(f); err != nil || w != 1080 || h != 1920 || requests > 3 {
		t.Fatal(w, h, err, requests)
	}
}
