package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
)

func fixture(t *testing.T, h http.HandlerFunc) (*Relay, core.Job) {
	t.Helper()
	server := httptest.NewServer(h)
	t.Cleanup(server.Close)
	s := store.NewMemory()
	m := core.Model{ID: "image", Key: "real-key", Name: "Fixture", Kind: "image", Available: true, Published: true}
	_, _ = s.Put(context.Background(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
	p := &Relay{Client: relay.New(server.URL, "secret-test"), Store: s,
		Assets:     func(context.Context, core.Job) ([]core.Reference, error) { return nil, nil },
		SaveResult: func(_ context.Context, _ core.Job, u string) (string, error) { return u, nil }}
	return p, core.NewJob("user", "same-request", core.JobInput{Kind: "image", Model: "image", Prompt: "test"})
}

func TestSubmitOnceAndResume(t *testing.T) {
	var posts, polls atomic.Int32
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret-test" {
			t.Error("missing auth")
		}
		if r.Method == "POST" {
			posts.Add(1)
			w.WriteHeader(202)
			_, _ = w.Write([]byte(`{"id":"task_1","status":"processing"}`))
			return
		}
		polls.Add(1)
		_, _ = w.Write([]byte(`{"id":"task_1","status":"succeeded","output_url":"https://cdn.example/result.png"}`))
	})
	if _, e := p.Generate(context.Background(), j); !errors.Is(e, ErrPending) {
		t.Fatalf("submission %v", e)
	}
	// A new provider instance, like a different worker, resumes persisted state.
	second := *p
	result, e := second.Generate(context.Background(), j)
	if e != nil || result != "https://cdn.example/result.png" {
		t.Fatal(result, e)
	}
	if _, e = p.Generate(context.Background(), j); e != nil {
		t.Fatal(e)
	}
	if posts.Load() != 1 || polls.Load() != 1 {
		t.Fatalf("post=%d poll=%d", posts.Load(), polls.Load())
	}
}

func TestConcurrentWorkersNeverDuplicateSubmission(t *testing.T) {
	var calls atomic.Int32
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"data":[{"url":"https://cdn.example/image.png"}]}`))
	})
	var group sync.WaitGroup
	for range 20 {
		group.Go(func() { _, _ = p.Generate(context.Background(), j) })
	}
	group.Wait()
	if calls.Load() != 1 {
		t.Fatalf("duplicate generation calls: %d", calls.Load())
	}
}

func TestUncertainSubmissionNeverAutomaticallyRetries(t *testing.T) {
	var calls atomic.Int32
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(502) })
	for range 2 {
		if _, err := p.Generate(context.Background(), j); !errors.Is(err, ErrUncertain) && err.Error() != ErrUncertain.Error() {
			t.Fatal(err)
		}
	}
	if calls.Load() != 1 {
		t.Fatal("retried ambiguous submission")
	}
}

func TestTransientPollingFailureDoesNotResubmit(t *testing.T) {
	var calls atomic.Int32
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			calls.Add(1)
			_, _ = w.Write([]byte(`{"id":"task_x","status":"processing"}`))
			return
		}
		w.WriteHeader(503)
	})
	for range 3 {
		if _, e := p.Generate(context.Background(), j); !errors.Is(e, ErrPending) {
			t.Fatal(e)
		}
	}
	if calls.Load() != 1 {
		t.Fatal("resubmitted on poll failure")
	}
}

func TestResponseOnlyReleasesTerminalMedia(t *testing.T) {
	r, e := Parse([]byte(`{"id":"task","status":"processing","output_url":"https://cdn.example/provisional.mp4"}`), "video")
	if e != nil || !r.Pending || r.Result != "" {
		t.Fatal(r, e)
	}
	if _, e = Parse([]byte(`{"status":"failed","error":{"message":"private payload"}}`), "image"); e == nil {
		t.Fatal("terminal error ignored")
	}
	r, e = Parse([]byte(`{"choices":[{"message":{"content":"actual reply"}}]}`), "chat")
	if e != nil || r.Result != "actual reply" {
		t.Fatal(r, e)
	}
	if _, e = Parse([]byte(`{"output_url":"http://127.0.0.1/file"}`), "image"); e == nil {
		t.Fatal("unsafe result URL accepted")
	}
}

func TestRequestParameters(t *testing.T) {
	path, b, e := Request(core.JobInput{Kind: "video", Prompt: "p", Resolution: "720p", Ratio: "9:16", Duration: 5}, "upstream", []core.Reference{{URL: "https://cdn/ref.jpg", Type: "image"}})
	if e != nil || path != "/openapi/v1/generations" || b["mode"] != "i2v" || b["image_url"] != "https://cdn/ref.jpg" {
		t.Fatal(path, b, e)
	}
	path, b, e = Request(core.JobInput{Kind: "image", Prompt: "p", Quality: "high"}, "upstream", []core.Reference{{URL: "https://cdn/ref.jpg", Type: "image"}})
	if e != nil || path != "/v1/images/edits" || b["quality"] != "high" {
		t.Fatal(path, b, e)
	}
	_, b, e = Request(core.JobInput{Kind: "chat", Prompt: "hello"}, "text", nil)
	raw, _ := json.Marshal(b)
	if e != nil || len(raw) == 0 || b["stream"] != false {
		t.Fatal(b, e)
	}
}
