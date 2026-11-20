package llm

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func sse(events ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		for _, e := range events {
			_, _ = w.Write([]byte("data: " + e + "\n\n"))
		}
	}
}

// A streamed reply reports its text as it grows, then the usage.
func TestStreamedReplyGrowsThenReportsUsage(t *testing.T) {
	srv := httptest.NewServer(sse(`{"choices":[{"delta":{"role":"assistant"}}]}`, `{"choices":[{"delta":{"content":"镜头"}}]}`,
		`{"choices":[{"delta":{"content":"1：推门"}}]}`, `{"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":5}}`, "[DONE]"))
	defer srv.Close()
	var seen []string
	text, u, err := (&Client{BaseURL: srv.URL, Key: "k"}).Complete(t.Context(), "m", nil, 0, func(s string) error { seen = append(seen, s); return nil })
	if err != nil || text != "镜头1：推门" || u.Input != 12 || u.Output != 5 {
		t.Fatal(text, u, err)
	}
	if strings.Join(seen, "|") != "镜头|镜头1：推门" {
		t.Fatal(seen)
	}
}

// A reply cut off before [DONE] fails instead of keeping half a plan; the
// callback can stop a reply (another worker took the turn).
func TestStreamCutOffOrStoppedFails(t *testing.T) {
	cut := httptest.NewServer(sse(`{"choices":[{"delta":{"content":"镜头"}}]}`))
	defer cut.Close()
	if _, _, err := (&Client{BaseURL: cut.URL, Key: "k"}).Complete(t.Context(), "m", nil, 0, nil); err == nil || !strings.Contains(err.Error(), "中断") {
		t.Fatal(err)
	}
	stop := errors.New("stop")
	whole := httptest.NewServer(sse(`{"choices":[{"delta":{"content":"镜头"}}]}`, "[DONE]"))
	defer whole.Close()
	if _, _, err := (&Client{BaseURL: whole.URL, Key: "k"}).Complete(t.Context(), "m", nil, 0, func(string) error { return stop }); !errors.Is(err, stop) {
		t.Fatal(err)
	}
}
