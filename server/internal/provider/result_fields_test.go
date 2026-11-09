package provider

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestParseFindsNestedAndInlineResults(t *testing.T) {
	cases := map[string]string{
		`{"id":"t","status":"SUCCEEDED","result":{"images":[{"url":"https://cdn.example/a.png"}]}}`: "https://cdn.example/a.png",
		`{"id":"t","status":"finished","output":["https://cdn.example/b.png"]}`:                     "https://cdn.example/b.png",
		`{"created":1,"data":[{"b64_json":"iVBORw0KGgo="}]}`:                                        "data:;base64,iVBORw0KGgo=",
	}
	for raw, want := range cases {
		r, err := Parse([]byte(raw), "image")
		if err != nil || r.Result != want || r.Pending {
			t.Fatal(raw, r, err)
		}
	}
	// Request echoes are never mistaken for the generated result.
	r, err := Parse([]byte(`{"id":"t","status":"succeeded","image_urls":["https://cdn.example/input.png"]}`), "image")
	var unreadable *Unreadable
	if !errors.As(err, &unreadable) || r.Result != "" || !strings.Contains(err.Error(), "image_urls") {
		t.Fatal("input echo taken as result", r, err)
	}
}

func TestFinishedTaskWithoutResultStopsAndExplainsWhy(t *testing.T) {
	polls := 0
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			_, _ = w.Write([]byte(`{"id":"task_9","status":"queued"}`))
			return
		}
		polls++
		_, _ = w.Write([]byte(`{"id":"task_9","status":"succeeded","payload":{"x":1}}`))
	})
	ctx := context.Background()
	if _, e := p.Generate(ctx, j); !errors.Is(e, ErrPending) {
		t.Fatal(e)
	}
	if note := executionNote(t, p, j.ID); note != "上游状态：queued" {
		t.Fatal("pending reason not recorded:", note)
	}
	if _, e := p.Generate(ctx, j); e == nil || errors.Is(e, ErrPending) {
		t.Fatal("finished task kept polling", e)
	}
	if note := executionNote(t, p, j.ID); !strings.Contains(note, "payload") {
		t.Fatal("unreadable reason not recorded:", note)
	}
	if polls != 1 {
		t.Fatal("polls", polls)
	}
}

func TestSaveFailureIsRecordedWhileRetrying(t *testing.T) {
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"url":"https://cdn.example/r.png"}]}`))
	})
	p.SaveResult = func(context.Context, core.Job, string) (string, error) {
		return "", errors.New("拒绝非公网结果地址")
	}
	if _, e := p.Generate(context.Background(), j); !errors.Is(e, ErrPending) {
		t.Fatal(e)
	}
	if note := executionNote(t, p, j.ID); !strings.Contains(note, "结果保存失败") || !strings.Contains(note, "拒绝非公网结果地址") {
		t.Fatal("save failure hidden:", note)
	}
}

func executionNote(t *testing.T, p *Relay, id string) string {
	t.Helper()
	row, err := p.Store.Get(context.Background(), "executions", id)
	if err != nil {
		t.Fatal(err)
	}
	var e Execution
	_ = json.Unmarshal(row.Data, &e)
	return e.Note
}

func TestSubmitSuccessWithoutResultKeepsPolling(t *testing.T) {
	polls := 0
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			_, _ = w.Write([]byte(`{"id":"t1","status":"success"}`))
			return
		}
		polls++
		_, _ = w.Write([]byte(`{"id":"t1","status":"succeeded","output_url":"https://cdn.example/x.png"}`))
	})
	if _, e := p.Generate(context.Background(), j); !errors.Is(e, ErrPending) {
		t.Fatal("acknowledged submit failed the job", e)
	}
	if out, e := p.Generate(context.Background(), j); e != nil || out != "https://cdn.example/x.png" || polls != 1 {
		t.Fatal(out, e, polls)
	}
}

func TestServiceUnavailableIsADefiniteRejection(t *testing.T) {
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
		_, _ = w.Write([]byte(`{"error":"overloaded"}`))
	})
	_, e := p.Generate(context.Background(), j)
	if e == nil || errors.Is(e, ErrUncertain) || errors.Is(e, ErrPending) {
		t.Fatal("503 should release the hold, got", e)
	}
	if note := executionPhase(t, p, j.ID); note != "failed" {
		t.Fatal("phase", note)
	}
}

func executionPhase(t *testing.T, p *Relay, id string) string {
	t.Helper()
	row, _ := p.Store.Get(context.Background(), "executions", id)
	var e Execution
	_ = json.Unmarshal(row.Data, &e)
	return e.Phase
}
