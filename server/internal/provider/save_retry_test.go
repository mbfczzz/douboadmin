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

// A failed result save waits longer before the next try and leaves its
// reason on the execution, even when the task's own deadline has passed.
func TestFailedSaveBacksOffAndRecordsReason(t *testing.T) {
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"task_1","status":"succeeded","output_url":"https://cdn.example/result.png"}`))
	})
	p.SaveResult = func(ctx context.Context, _ core.Job, _ string) (string, error) {
		return "", errors.New("下载生成结果失败")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, e := p.Generate(ctx, j); !errors.Is(e, ErrRetryLater) || !errors.Is(e, ErrPending) {
		t.Fatalf("first save %v", e)
	}
	cancel() // the task deadline passes during the next try
	if _, e := p.Generate(ctx, j); !errors.Is(e, ErrPending) {
		t.Fatalf("second save %v", e)
	}
	row, err := p.Store.Get(context.Background(), "executions", j.ID)
	var e Execution
	if err != nil || json.Unmarshal(row.Data, &e) != nil {
		t.Fatal(err)
	}
	if e.Phase != "output" || !strings.Contains(e.Note, "结果保存失败") || !strings.Contains(e.Note, "下载生成结果失败") {
		t.Fatalf("execution %+v", e)
	}
}
