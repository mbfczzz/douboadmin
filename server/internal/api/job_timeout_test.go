package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestExpiredTasksDisappearFromRunningListAndHaveExplicitFailureMessage(t *testing.T) {
	a, user, _ := setup(t)
	for _, tt := range []struct {
		kind string
		age  time.Duration
	}{{"image", 11 * time.Minute}, {"video", 61 * time.Minute}} {
		j := core.NewJob("user-a", "timeout-"+tt.kind, core.JobInput{Kind: tt.kind, Model: "demo-image", Prompt: "test"})
		j.CreatedAt = time.Now().Add(-tt.age)
		j.UpdatedAt = j.CreatedAt
		if _, err := a.Store.CreateJob(t.Context(), j); err != nil {
			t.Fatal(err)
		}
		_, err := a.Store.Claim(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		_, err = a.Store.Put(t.Context(), "executions", core.Record{ID: j.ID, Data: core.Data(map[string]any{"phase": "output", "taskId": "upstream", "result": "https://fixture.test/output.png", "startedAt": time.Now()})}, 0)
		if err != nil {
			t.Fatal(err)
		}
		if n, err := a.Store.ExpireJobs(t.Context(), time.Now(), 100); err != nil || n != 1 {
			t.Fatal(n, err)
		}
		w := call(a, "GET", "/api/jobs/"+j.ID, user, "", nil)
		var view core.Job
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &view) != nil || view.Status != "failed" || view.Error != (&core.JobTimeout{Kind: tt.kind}).Error() || view.Result != "" {
			t.Fatal(w.Body.String())
		}
		if view.Retryable {
			t.Fatal("submitted timed-out task allowed blind resubmission")
		}
	}
	w := call(a, "GET", "/api/jobs?page=1&size=1&status=running&excludeChat=true&excludeImport=true", user, "", nil)
	var page core.JobPage
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 0 {
		t.Fatal("expired task still running", w.Body.String())
	}
	w = call(a, "GET", "/api/jobs?page=1&status=failed", user, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 2 || !strings.Contains(w.Body.String(), "已超时失败") {
		t.Fatal(w.Body.String())
	}
}
