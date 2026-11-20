package provider

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Stopping keeps what was written (charged by its length) and ends the turn.
func TestStoppedReplyKeepsWhatWasWritten(t *testing.T) {
	s, p, j, _ := directFixture(t, "", 200)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"镜头1：推门\"}}]}\n\n")
		w.(http.Flusher).Flush()
		for i := 0; i < 200 && Partial(r.Context(), s, j.ID) == ""; i++ {
			time.Sleep(10 * time.Millisecond)
		}
		if err := StopChat(r.Context(), s, j.ID, "u"); err != nil {
			t.Error(err)
		}
		<-r.Context().Done() // the provider is cut off, not read to the end
	}))
	defer srv.Close()
	p.Clients["deepseek"].BaseURL = srv.URL
	text, err := p.Generate(t.Context(), j)
	if err != nil || text != "镜头1：推门\n\n（已停止回复）" {
		t.Fatal(text, err)
	}
	if _, bill := funds(t, s, j.ID); bill.UsedUnits == nil || *bill.UsedUnits <= 0 || bill.OutputTokens != 6 {
		t.Fatal("a stopped reply is charged for what was written", bill)
	}
}

// Stopped before it starts: nothing is called and the turn fails (refunded).
func TestStoppedBeforeStartIsNotCalled(t *testing.T) {
	s, p, j, bodies := directFixture(t, "", 200)
	if err := StopChat(t.Context(), s, j.ID, "u"); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Generate(t.Context(), j); err == nil || !strings.Contains(err.Error(), "已停止") || len(*bodies) != 0 {
		t.Fatal(err, len(*bodies))
	}
}
