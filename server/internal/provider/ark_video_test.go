package provider

import (
	"context"
	"doubo/server/internal/arkvideo"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// fakeArk answers 创建 / 查询视频生成任务: queued once, then the given reply.
func fakeArk(t *testing.T, create int, createBody, task string) (*httptest.Server, *atomic.Int32) {
	creates, polls := new(atomic.Int32), new(atomic.Int32)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer video-key" {
			t.Error("key", r.Header.Get("Authorization"))
		}
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/v3/contents/generations/tasks":
			creates.Add(1)
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["model"] != "doubao-seedance-2-0-260128" {
				t.Error("model", body["model"])
			}
			w.WriteHeader(create)
			_, _ = w.Write([]byte(createBody))
		case r.Method == "GET" && r.URL.Path == "/api/v3/contents/generations/tasks/cgt-1":
			if polls.Add(1) == 1 {
				_, _ = w.Write([]byte(`{"id":"cgt-1","status":"queued"}`))
				return
			}
			_, _ = w.Write([]byte(task))
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(srv.Close)
	return srv, creates
}

func arkFixture(t *testing.T, url string) (*store.Memory, *ArkVideo, core.Job, *[]string) {
	s, ctx := store.NewMemory(), t.Context()
	if err := arkvideo.Ensure(ctx, s, true); err != nil {
		t.Fatal(err)
	}
	_ = s.Atomic(ctx, func(tx store.Transaction) error {
		_, e := store.ApplyFunds(tx, core.LedgerEntry{UserID: "u", Reference: "seed", Kind: "admin_adjust", AvailableDelta: 100000})
		return e
	})
	in := core.JobInput{Kind: "video", Model: arkvideo.ModelID("doubao-seedance-2-0-260128"), Prompt: "海边", Resolution: "720p", Ratio: "16:9", Duration: 5, Assets: []string{}}
	row, _ := s.Get(ctx, "models", in.Model)
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	units, err := billing.ArkVideoHold(m.Effective(), in, nil)
	if err != nil {
		t.Fatal(err)
	}
	j := core.NewJob("u", core.NewID(), in)
	j.CostUnits = units
	if _, err = s.CreateJob(ctx, j); err != nil {
		t.Fatal(err)
	}
	if j, err = s.Claim(ctx); err != nil {
		t.Fatal(err)
	}
	saved := &[]string{}
	p := &ArkVideo{Client: &arkvideo.Client{BaseURL: url + "/api/v3", Key: "video-key"}, Store: s,
		Assets: func(context.Context, core.Job) ([]core.Reference, error) { return nil, nil },
		SaveResult: func(_ context.Context, _ core.Job, u string) (string, error) {
			*saved = append(*saved, u)
			return "asset:result", nil
		}}
	return s, p, j, saved
}

// Submitted once, polled, charged the reported tokens (the rest returned) and saved.
func TestArkVideoChargesReportedTokens(t *testing.T) {
	srv, creates := fakeArk(t, 200, `{"id":"cgt-1"}`, `{"id":"cgt-1","status":"succeeded","content":{"video_url":"https://ark/v.mp4"},"usage":{"completion_tokens":108900,"total_tokens":108900}}`)
	s, p, j, saved := arkFixture(t, srv.URL)
	if ark, err := p.Route(t.Context(), j); !ark || err != nil {
		t.Fatal("not routed to 火山方舟", err)
	}
	for i := 0; i < 2; i++ { // submit, then queued
		if _, err := p.Generate(t.Context(), j); !errors.Is(err, ErrPending) {
			t.Fatal(i, err)
		}
	}
	result, err := p.Generate(t.Context(), j)
	if err != nil || result != "asset:result" || len(*saved) != 1 || (*saved)[0] != "https://ark/v.mp4" || creates.Load() != 1 {
		t.Fatal(result, err, *saved, creates.Load())
	}
	if again, err := p.Generate(t.Context(), j); err != nil || again != result || creates.Load() != 1 {
		t.Fatal("a repeat never submits again", again, err)
	}
	if err = s.Finish(t.Context(), j, result, ""); err != nil {
		t.Fatal(err)
	}
	w, bill := funds(t, s, j.ID)
	if bill.State != "charged" || bill.Units != 5010 || bill.ReservedUnits != j.CostUnits || bill.VideoTokens != 108900 || w.Available != 100000-5010 {
		t.Fatal("108,900 tokens at ¥46/M = 50.10 points", bill, w)
	}
}

// A refused task (content review) fails at once and is shown as such.
func TestArkVideoRefusalIsFinal(t *testing.T) {
	srv, _ := fakeArk(t, 400, `{"error":{"code":"InputTextSensitiveContentDetected","message":"sensitive"}}`, "")
	s, p, j, _ := arkFixture(t, srv.URL)
	if _, err := p.Generate(t.Context(), j); err == nil || err.Error() != "内容未通过安全审核" {
		t.Fatal(err)
	}
	row, _ := s.Get(t.Context(), "executions", j.ID)
	var e Execution
	_ = json.Unmarshal(row.Data, &e)
	if e.Phase != "failed" || e.ErrorCode != 5002 || !strings.Contains(e.ErrorCause, "InputTextSensitiveContentDetected") {
		t.Fatal(e)
	}
}

// A failed task ends the job; an unknown submit outcome is never resubmitted.
func TestArkVideoFailedTaskAndUnknownSubmit(t *testing.T) {
	srv, _ := fakeArk(t, 200, `{"id":"cgt-1"}`, `{"id":"cgt-1","status":"failed","error":{"code":"OutputVideoSensitiveContentDetected","message":"x"}}`)
	_, p, j, _ := arkFixture(t, srv.URL)
	for i := 0; i < 2; i++ {
		_, _ = p.Generate(t.Context(), j)
	}
	if _, err := p.Generate(t.Context(), j); err == nil || err.Error() != "内容未通过安全审核" {
		t.Fatal(err)
	}
	broken, creates := fakeArk(t, 502, `{}`, "")
	_, p, j, _ = arkFixture(t, broken.URL)
	if _, err := p.Generate(t.Context(), j); !errors.Is(err, ErrUncertain) {
		t.Fatal(err)
	}
	if _, err := p.Generate(t.Context(), j); !errors.Is(err, ErrUncertain) || creates.Load() != 1 {
		t.Fatal("resubmitted after an unknown outcome", err, creates.Load())
	}
}

// Too close to the job's deadline nothing is submitted (it would finish after
// the job timed out); a submitted task is routed by its execution row.
func TestArkVideoDeadlineAndRouting(t *testing.T) {
	srv, creates := fakeArk(t, 200, `{"id":"cgt-1"}`, `{"id":"cgt-1","status":"running"}`)
	s, p, j, _ := arkFixture(t, srv.URL)
	late := j
	late.CreatedAt = j.CreatedAt.Add(-50 * time.Minute)
	var timeout *core.JobTimeout
	if _, err := p.Generate(t.Context(), late); !errors.As(err, &timeout) || creates.Load() != 0 {
		t.Fatal("submitted with 10 minutes left", err, creates.Load())
	}
	if _, err := p.Generate(t.Context(), j); !errors.Is(err, ErrPending) || creates.Load() != 1 {
		t.Fatal(err)
	}
	row, _ := s.Get(t.Context(), "models", j.Input.Model)
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.Key = "video-pro" // whatever the row says now, the submitted task is followed at 方舟
	if _, err := s.Put(t.Context(), "models", core.Record{ID: row.ID, Data: core.Data(m)}, row.Version); err != nil {
		t.Fatal(err)
	}
	if ark, err := p.Route(t.Context(), j); !ark || err != nil {
		t.Fatal("a submitted task left 火山方舟", ark, err)
	}
}
