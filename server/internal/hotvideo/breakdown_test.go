package hotvideo

import (
	"context"
	"doubo/server/internal/store"
	"doubo/server/internal/vision"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Concurrent preparations of one video call the model once; a failure is
// retried by the next caller; a done result is reused without a model call.
func TestEnsureBreakdownSharedOnce(t *testing.T) {
	var calls atomic.Int32
	var failing atomic.Bool
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if failing.Load() {
			w.WriteHeader(500)
			return
		}
		time.Sleep(50 * time.Millisecond)
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": `{"hook":"钩子","shots":[{"start":0,"end":2,"action":"开箱"}]}`}}}})
	}))
	defer model.Close()
	s := &Service{Client: &Client{}, Store: store.NewMemory()}
	v := &vision.Client{BaseURL: model.URL, Key: "k", Model: "m"}
	link := func() (string, error) { return "https://oss.example/v.mp4", nil }
	ctx := context.Background()
	breakdownPoll = 20 * time.Millisecond

	failing.Store(true)
	if _, err := s.EnsureBreakdown(ctx, v, "7301", link); err == nil {
		t.Fatal("failure not reported")
	}
	failing.Store(false)
	var wg sync.WaitGroup
	hooks := make([]string, 3)
	for i := range hooks {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if b, err := s.EnsureBreakdown(ctx, v, "7301", link); err == nil {
				hooks[i] = b.Hook
			}
		}()
	}
	wg.Wait()
	if hooks[0] != "钩子" || hooks[1] != "钩子" || hooks[2] != "钩子" || calls.Load() != 2 {
		t.Fatalf("hooks %v calls %d", hooks, calls.Load())
	}
	rec, _, err := s.ReadBreakdown(ctx, "m", "7301")
	if err != nil || rec.Status != "done" || rec.Active() {
		t.Fatalf("%+v %v", rec, err)
	}
}
