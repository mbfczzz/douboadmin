package relay

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func slowServer(t *testing.T, delay time.Duration) *Client {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(delay):
			_, _ = w.Write([]byte(`{"ok":true}`))
		case <-r.Context().Done():
		}
	}))
	t.Cleanup(srv.Close)
	return New(srv.URL, "k")
}

func TestCallerDeadlineOutlastsDefaultTimeout(t *testing.T) {
	c := slowServer(t, 150*time.Millisecond)
	c.Timeout = 50 * time.Millisecond
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := c.Do(ctx, "POST", "/v1/images/generations", map[string]any{}); err != nil {
		t.Fatal("slow synchronous generation was cut off:", err)
	}
}

func TestDefaultTimeoutBoundsCallsWithoutDeadline(t *testing.T) {
	c := slowServer(t, time.Second)
	c.Timeout = 50 * time.Millisecond
	start := time.Now()
	if _, err := c.Do(context.Background(), "GET", "/v1/models", nil); err == nil {
		t.Fatal("call without deadline should time out")
	}
	if time.Since(start) > 500*time.Millisecond {
		t.Fatal("default timeout not applied")
	}
}
