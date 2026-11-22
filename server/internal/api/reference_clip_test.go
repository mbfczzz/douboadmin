package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// 一键复刻's reference: the original's first N seconds without sound, made
// once and owned by the user; someone else's video gives nothing.
func TestReferenceClipIsTheFirstSecondsWithoutSound(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not installed")
	}
	a, one, two := setup(t)
	key := "uploads/user-a/source.mp4"
	full := filepath.Join(a.Config.MediaDir, key)
	_ = os.MkdirAll(filepath.Dir(full), 0o755)
	gen := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=4",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-g", "5", "-c:a", "aac", "-shortest", full)
	if out, err := gen.CombinedOutput(); err != nil {
		t.Skip("cannot make a fixture video: ", string(out))
	}
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "source", Owner: "user-a", Data: core.Data(map[string]any{"key": key, "type": "video/mp4", "size": 1})}, 0)
	clip := func(token string, seconds int) (core.Record, int) {
		w := call(a, "POST", "/api/assets/source/reference-clip", token, "", map[string]any{"seconds": seconds})
		var row core.Record
		_ = json.Unmarshal(w.Body.Bytes(), &row)
		return row, w.Code
	}
	row, code := clip(one, 2)
	if code != 200 || row.ID == "source" || row.Owner != "user-a" {
		t.Fatal(code, row)
	}
	var data map[string]any
	_ = json.Unmarshal(row.Data, &data)
	out := filepath.Join(a.Config.MediaDir, data["key"].(string))
	probe, _ := exec.Command("ffprobe", "-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "csv=p=0", out).Output()
	text := string(probe)
	if strings.Contains(text, "audio") || !strings.Contains(text, "video") {
		t.Fatal("streams:", text)
	}
	lines := strings.Fields(text)
	seconds, _ := strconv.ParseFloat(lines[len(lines)-1], 64)
	if seconds < 1.5 || seconds > 2.6 {
		t.Fatal("duration", seconds)
	}
	if again, _ := clip(one, 2); again.ID != row.ID {
		t.Fatal("made twice")
	}
	if _, code := clip(two, 2); code != 404 {
		t.Fatal("another user's video", code)
	}
	if _, code := clip(one, 0); code != 400 {
		t.Fatal("bad length", code)
	}
}

// With OSS the server downloads the original itself and gives ffmpeg a local
// file (a static ffmpeg build crashed reading the signed OSS link).
type linkedObjects struct {
	link string
	put  map[string][]byte
}

func (o *linkedObjects) Put(_ context.Context, key string, r io.Reader, _ string) error {
	data, err := io.ReadAll(r)
	o.put[key] = data
	return err
}
func (o *linkedObjects) URL(_ context.Context, key string) (string, error) {
	return o.link + "/" + key, nil
}

func TestReferenceClipDownloadsTheOriginalFromStorage(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not installed")
	}
	a, one, _ := setup(t)
	source := filepath.Join(t.TempDir(), "source.mp4")
	gen := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=3",
		"-f", "lavfi", "-i", "sine=duration=3", "-c:v", "libx264", "-c:a", "aac", "-shortest", source)
	if out, err := gen.CombinedOutput(); err != nil {
		t.Skip("cannot make a fixture video: ", string(out))
	}
	served := 0
	oss := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served++
		http.ServeFile(w, r, source)
	}))
	defer oss.Close()
	objects := &linkedObjects{link: oss.URL, put: map[string][]byte{}}
	a.Objects = objects
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "stored", Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/user-a/stored.mp4", "type": "video/mp4", "size": 1})}, 0)
	w := call(a, "POST", "/api/assets/stored/reference-clip", one, "", map[string]any{"seconds": 30})
	if w.Code != 200 || served != 1 || len(objects.put) != 1 {
		t.Fatal(w.Code, w.Body.String(), served, len(objects.put))
	}
	for _, data := range objects.put {
		clip := filepath.Join(t.TempDir(), "clip.mp4")
		_ = os.WriteFile(clip, data, 0o600)
		probe, _ := exec.Command("ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", clip).Output()
		if strings.Contains(string(probe), "audio") || !strings.Contains(string(probe), "video") {
			t.Fatal("streams:", string(probe))
		}
	}
}
