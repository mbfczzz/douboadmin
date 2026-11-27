package provider

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func managedFixture(t *testing.T, status int, payload string) (*Relay, core.Job) {
	return fixture(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status); _, _ = w.Write([]byte(payload)) })
}

func executionOf(t *testing.T, p *Relay, id string) Execution {
	t.Helper()
	row, err := p.Store.Get(t.Context(), "executions", id)
	if err != nil {
		t.Fatal(err)
	}
	var value Execution
	if json.Unmarshal(row.Data, &value) != nil {
		t.Fatal("invalid execution")
	}
	return value
}

func TestManagedSubmitErrorsPersistPublicCodeAndGuidance(t *testing.T) {
	for _, tc := range []struct {
		code, status int
		phase        string
		retry        bool
	}{
		{5002, 400, "failed", false}, {5006, 503, "failed", true}, {5011, 502, "uncertain", false}, {5202, 502, "uncertain", false},
	} {
		t.Run(fmt.Sprint(tc.code), func(t *testing.T) {
			rule := managedRulesForTest(tc.code)
			payload := fmt.Sprintf("{\"error\":{\"code\":%d,\"type\":%q,\"user_message\":\"客户提示\"}}", tc.code, rule.typ)
			p, job := managedFixture(t, tc.status, payload)
			_, err := p.Generate(context.Background(), job)
			if err == nil || !strings.Contains(err.Error(), "客户提示") {
				t.Fatal(err)
			}
			e := executionOf(t, p, job.ID)
			if e.Phase != tc.phase || e.ErrorCode != tc.code || e.ErrorType != rule.typ || e.ErrorAction == "" || e.ErrorRetryable != tc.retry {
				t.Fatal(e)
			}
		})
	}
}

// Helpers keep this test in provider while the catalog remains owned by relay.
func managedRulesForTest(code int) struct{ typ string } {
	types := map[int]string{5002: "safety_policy", 5006: "provider_unavailable", 5011: "submission_outcome_unknown", 5202: "upstream_network_error"}
	return struct{ typ string }{types[code]}
}
func TestManagedFailedTaskBodyAndPollingTimeoutAreTerminal(t *testing.T) {
	p, job := managedFixture(t, 200, "{\"id\":\"task\",\"status\":\"failed\",\"error\":{\"code\":5009,\"type\":\"copyright_restriction\",\"user_message\":\"版权提示\"}}")
	if _, err := p.Generate(context.Background(), job); err == nil || !strings.Contains(err.Error(), "版权提示") {
		t.Fatal(err)
	}
	e := executionOf(t, p, job.ID)
	if e.ErrorCode != 5009 || e.Phase != "failed" || e.ErrorRetryable {
		t.Fatal(e)
	}

	requests := 0
	p, job = fixture(t, func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Method == "POST" {
			_, _ = w.Write([]byte("{\"id\":\"poll-task\",\"status\":\"processing\"}"))
			return
		}
		w.WriteHeader(504)
		_, _ = w.Write([]byte("{\"error\":{\"code\":5007,\"type\":\"generation_timeout\",\"user_message\":\"生成超时提示\"}}"))
	})
	if _, err := p.Generate(context.Background(), job); !errors.Is(err, ErrPending) {
		t.Fatal(err)
	}
	if _, err := p.Generate(context.Background(), job); err == nil || !strings.Contains(err.Error(), "生成超时提示") {
		t.Fatal(err)
	}
	e = executionOf(t, p, job.ID)
	if requests != 2 || e.ErrorCode != 5007 || e.Phase != "failed" {
		t.Fatal(requests, e)
	}
}

// Querying a task whose generation already failed content review, which the
// relay answers as 503 / 5006 provider_unavailable, ends the task (safety
// failure, no hour of retries) instead of waiting for the model to recover.
func TestPollingAFinishedSafetyFailureLabelledUnavailableEndsTheTask(t *testing.T) {
	p, job := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			_, _ = w.Write([]byte(`{"id":"poll-task","status":"processing"}`))
			return
		}
		w.WriteHeader(503)
		_, _ = w.Write([]byte(`{"error":{"code":5006,"type":"provider_unavailable","message":"generation_failed: The generated audio did not pass the content safety review."}}`))
	})
	if _, err := p.Generate(context.Background(), job); !errors.Is(err, ErrPending) {
		t.Fatal(err)
	}
	_, err := p.Generate(context.Background(), job)
	if err == nil || errors.Is(err, ErrRetryLater) || !strings.Contains(err.Error(), "安全审核") {
		t.Fatal(err)
	}
	if e := executionOf(t, p, job.ID); e.Phase != "failed" || e.ErrorCode != 5002 || e.ErrorRetryable {
		t.Fatal(e)
	}
}

// The upstream refusing a too-long reference video, still answered as 503 /
// 5006 while the task is queried, ends the task at once (refunded) instead
// of an hour of retries.
func TestPollingARefusedReferenceLengthEndsTheTask(t *testing.T) {
	p, job := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			_, _ = w.Write([]byte(`{"id":"poll-task","status":"processing"}`))
			return
		}
		w.WriteHeader(503)
		_, _ = w.Write([]byte(`{"error":{"code":5006,"type":"provider_unavailable","message":"upstream_error: Reference video 1 lasts 30.167 seconds; each reference video must last between 2 and 30 seconds; 备用渠道不可用：provider unavailable: HTTP 401 MEDIA_TOKEN_DENIED: 未提供有效的 API 凭据。"}}`))
	})
	if _, err := p.Generate(context.Background(), job); !errors.Is(err, ErrPending) {
		t.Fatal(err)
	}
	if _, err := p.Generate(context.Background(), job); err == nil || errors.Is(err, ErrRetryLater) || errors.Is(err, ErrPending) {
		t.Fatal("still retrying", err)
	}
	if e := executionOf(t, p, job.ID); e.Phase != "failed" || e.ErrorCode != 5101 || e.ErrorRetryable {
		t.Fatal(e)
	}
}

// A plain "generation failed" (502 / 5001) whose text names a too-long
// reference video ends the task as that cause, so the user is told to cut it.
func TestPollingAFailedTaskNamingTheReferenceLength(t *testing.T) {
	p, job := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			_, _ = w.Write([]byte(`{"id":"poll-task","status":"processing"}`))
			return
		}
		w.WriteHeader(502)
		_, _ = w.Write([]byte(`{"error":{"code":5001,"type":"task_failed","message":"video_generation_failed: 本次生成失败：第1个视频素材：素材时长 30.067 秒，要求大于 0 且不超过 30 秒。已释放原预留款项。"}}`))
	})
	if _, err := p.Generate(context.Background(), job); !errors.Is(err, ErrPending) {
		t.Fatal(err)
	}
	if _, err := p.Generate(context.Background(), job); err == nil || errors.Is(err, ErrPending) {
		t.Fatal(err)
	}
	if e := executionOf(t, p, job.ID); e.Phase != "failed" || e.ErrorCode != 5101 {
		t.Fatal(e)
	}
}
