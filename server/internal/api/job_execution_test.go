package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"testing"
	"time"
)

func TestResumeIsAdminOnlyAndRequiresKnownUpstreamState(t *testing.T) {
	a, user, _ := setup(t)
	ctx := context.Background()
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	for _, phase := range []string{"polling", "output", "succeeded", "uncertain", "submitting", "failed"} {
		j := core.NewJob("user-a", phase, core.JobInput{Kind: "image", Model: "demo-image", Prompt: "test"})
		_, _ = a.Store.CreateJob(ctx, j)
		claimed, err := a.Store.Claim(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if err = a.Store.Finish(ctx, claimed, "", "interrupted"); err != nil {
			t.Fatal(err)
		}
		_, _ = a.Store.Put(ctx, "executions", core.Record{ID: j.ID, Data: core.Data(provider.Execution{Phase: phase, TaskID: "known", StartedAt: time.Now().Add(-2 * time.Hour)})}, 0)
		path := "/api/admin/jobs/" + j.ID + "/resume"
		if w := call(a, "POST", path, user, "", nil); w.Code != 403 {
			t.Fatal("user resumed admin state")
		}
		w := call(a, "POST", path, admin, "", nil)
		allowed := phase == "polling" || phase == "output" || phase == "succeeded"
		if allowed {
			if w.Code != 200 {
				t.Fatal(phase, w.Body.String())
			}
			row, _ := a.Store.Get(ctx, "executions", j.ID)
			var e provider.Execution
			_ = json.Unmarshal(row.Data, &e)
			if time.Since(e.StartedAt) > time.Minute {
				t.Fatal("recovery deadline not reset")
			}
			resumed, err := a.Store.Claim(ctx)
			if err != nil {
				t.Fatal(err)
			}
			_ = a.Store.Finish(ctx, resumed, "saved", "")
		} else if w.Code != 409 {
			t.Fatal("ambiguous request may be resubmitted", phase, w.Code)
		}
	}
}
