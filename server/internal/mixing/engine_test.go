package mixing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"doubo/server/internal/provider"
	"doubo/server/internal/relay"
	"doubo/server/internal/store"
	"errors"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestMixPipelinePersistsRewriteAndAsyncVoiceBeforeRendering(t *testing.T) {
	if os.Getenv("FFMPEG_INTEGRATION") != "true" {
		t.Skip("FFmpeg integration is opt-in")
	}
	runner := Runner{FFmpeg: os.Getenv("FFMPEG_PATH"), FFprobe: os.Getenv("FFPROBE_PATH")}
	if !runner.Ready() {
		t.Fatal("missing media tools")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	root := t.TempDir()
	if e := os.MkdirAll(filepath.Join(root, "uploads/user"), 0700); e != nil {
		t.Fatal(e)
	}
	photo := filepath.Join(root, "uploads/user/photo.png")
	f, e := os.Create(photo)
	if e != nil {
		t.Fatal(e)
	}
	if e = png.Encode(f, image.NewRGBA(image.Rect(0, 0, 320, 180))); e != nil {
		t.Fatal(e)
	}
	f.Close()
	if e = runner.Run(ctx, root, []string{"-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "pcm_s16le", "voice.wav"}, 0, nil); e != nil {
		t.Fatal(e)
	}
	wave, e := os.ReadFile(filepath.Join(root, "voice.wav"))
	if e != nil {
		t.Fatal(e)
	}
	assets := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/wav")
		_, _ = w.Write(wave)
	}))
	defer assets.Close()
	var chats, voices, polls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/chat/completions":
			chats.Add(1)
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"测试旁白。"}}]}`))
		case "/v1/audio/speech":
			voices.Add(1)
			w.WriteHeader(202)
			_, _ = w.Write([]byte(`{"id":"voice-fixture","status":"processing"}`))
		case "/v1/tasks/voice-fixture":
			polls.Add(1)
			_, _ = w.Write([]byte(`{"id":"voice-fixture","status":"succeeded","audio":{"url":"` + assets.URL + `"}}`))
		default:
			t.Error("unexpected endpoint", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer upstream.Close()
	s := store.NewMemory()
	_, _ = s.Put(ctx, "assets", core.Record{ID: "photo", Owner: "user", Data: core.Data(media.Asset{Key: "uploads/user/photo.png", Type: "image/png"})}, 0)
	for _, m := range []core.Model{{ID: "text", Key: "text-fixture", Kind: "chat", Published: true, Available: true}, {ID: "voice", Key: "tts-fixture", Kind: "audio", Published: true, Available: true}} {
		_, _ = s.Put(ctx, "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
	}
	m := &media.Service{Store: s, Dir: root, HTTP: assets.Client()}
	ai := &provider.Relay{Store: s, Client: relay.New(upstream.URL, "test"), Assets: m.Inputs, SaveResult: m.Save}
	engine := &Engine{Runner: runner, Store: s, Media: m, AI: ai, WorkDir: t.TempDir()}
	j := core.NewJob("user", "mix-pipeline", core.JobInput{Kind: "mix", Prompt: "原始文案", Assets: []string{"photo"}, Duration: 5, Resolution: "720p", Ratio: "16:9", Mix: &core.MixInput{Rewrite: true, Narration: true, Captions: true, RewriteModel: "text", TTSModel: "voice", Voice: "Zephyr"}})
	_, _ = s.CreateJob(ctx, j)
	claimed, e := s.Claim(ctx)
	if e != nil {
		t.Fatal(e)
	}
	_ = s.Hold(ctx, claimed, 180, false)
	var result string
	for range 12 {
		result, e = engine.Generate(ctx, claimed)
		if e == nil {
			break
		}
		if !errors.Is(e, provider.ErrPending) {
			t.Fatal(e)
		}
	}
	if result == "" || chats.Load() != 1 || voices.Load() != 1 || polls.Load() != 1 {
		t.Fatal(result, e, chats.Load(), voices.Load(), polls.Load())
	}
	if again, e := engine.Generate(ctx, claimed); e != nil || again != result {
		t.Fatal("completed stage was regenerated", e)
	}
	if chats.Load() != 1 || voices.Load() != 1 {
		t.Fatal("upstream invocation repeated")
	}
}
