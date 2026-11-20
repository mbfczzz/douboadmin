package api

import (
	"bufio"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func runningChat(t *testing.T, a *Server) core.Job {
	t.Helper()
	j := core.NewJob("user-a", core.NewID(), core.JobInput{Kind: "chat", Model: "ds", Prompt: "写脚本", Assets: []string{}})
	if _, err := a.Store.CreateJob(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	j, err := a.Store.Claim(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	return j
}

func partial(t *testing.T, a *Server, id, text string, version int64) int64 {
	t.Helper()
	row, err := a.Store.Put(t.Context(), "executions", core.Record{ID: id, Data: core.Data(provider.Execution{Phase: "submitting", Partial: text})}, version)
	if err != nil {
		t.Fatal(err)
	}
	return row.Version
}

// The stream sends the reply so far, then only what is new, then the end.
func TestChatStreamSendsTextThenDeltasThenDone(t *testing.T) {
	a, one, two := setup(t)
	j := runningChat(t, a)
	v := partial(t, a, j.ID, "镜头1", 0)
	go func() {
		time.Sleep(200 * time.Millisecond)
		partial(t, a, j.ID, "镜头1：推门", v)
		time.Sleep(400 * time.Millisecond)
		_ = a.Store.Finish(t.Context(), j, "镜头1：推门。", "")
	}()
	w := call(a, "GET", "/api/jobs/"+j.ID+"/stream", one, "", nil)
	body := w.Body.String()
	want := []string{`data: {"text":"镜头1"}`, `data: {"delta":"：推门"}`, `data: {"done":true,"status":"succeeded"}`}
	at := 0
	for _, part := range want {
		i := strings.Index(body[at:], part)
		if i < 0 {
			t.Fatalf("missing %s in %s", part, body)
		}
		at += i + len(part)
	}
	if w.Header().Get("Content-Type") != "text/event-stream; charset=utf-8" {
		t.Fatal(w.Header())
	}
	if call(a, "GET", "/api/jobs/"+j.ID+"/stream", two, "", nil).Code != 404 {
		t.Fatal("another user read the stream")
	}
}

// A long stream ends asking the client to reconnect.
func TestChatStreamAsksToReconnect(t *testing.T) {
	a, one, _ := setup(t)
	j := runningChat(t, a)
	old := streamFor
	streamFor = 300 * time.Millisecond
	defer func() { streamFor = old }()
	if body := call(a, "GET", "/api/jobs/"+j.ID+"/stream", one, "", nil).Body.String(); !strings.HasSuffix(body, "data: {\"again\":true}\n\n") {
		t.Fatal(body)
	}
}

// Stop leaves a marker any worker sees; only the owner can stop.
func TestStopReplyMarksTheTurn(t *testing.T) {
	a, one, two := setup(t)
	j := runningChat(t, a)
	if call(a, "POST", "/api/jobs/"+j.ID+"/stop", two, "", nil).Code != 404 {
		t.Fatal("another user stopped the reply")
	}
	if w := call(a, "POST", "/api/jobs/"+j.ID+"/stop", one, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err := a.Store.Get(t.Context(), "chat_stops", j.ID); err != nil {
		t.Fatal("no stop marker", err)
	}
}

// Through the real HTTP stack (middleware included) each event arrives as it
// is sent, not when the reply ends.
func TestChatStreamIsFlushedThroughTheServer(t *testing.T) {
	a, one, _ := setup(t)
	j := runningChat(t, a)
	partial(t, a, j.ID, "镜头1", 0)
	srv := httptest.NewServer(a.Handler())
	defer srv.Close()
	req, _ := http.NewRequestWithContext(t.Context(), "GET", srv.URL+"/api/jobs/"+j.ID+"/stream", nil)
	req.Header.Set("Authorization", "Bearer "+one)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	got := make(chan string, 1)
	go func() {
		line, _ := bufio.NewReader(res.Body).ReadString('\n')
		got <- line
	}()
	select {
	case line := <-got:
		if line != "data: {\"text\":\"镜头1\"}\n" {
			t.Fatal(line)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the first event was held back")
	}
}

// The turn ending (partial cleared before the status flips) never blanks
// what the stream already sent.
func TestChatStreamNeverSendsAShorterText(t *testing.T) {
	a, one, _ := setup(t)
	j := runningChat(t, a)
	v := partial(t, a, j.ID, "镜头1：推门", 0)
	go func() {
		time.Sleep(150 * time.Millisecond)
		_, _ = a.Store.Put(t.Context(), "executions", core.Record{ID: j.ID, Data: core.Data(provider.Execution{Phase: "succeeded", Result: "镜头1：推门"})}, v)
		time.Sleep(600 * time.Millisecond)
		_ = a.Store.Finish(t.Context(), j, "镜头1：推门", "")
	}()
	body := call(a, "GET", "/api/jobs/"+j.ID+"/stream", one, "", nil).Body.String()
	if strings.Contains(body, `{"text":""}`) || !strings.Contains(body, `"done":true`) {
		t.Fatal(body)
	}
}
