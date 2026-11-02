package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
	"time"
)

func TestGenerationResumePreservesStateAndRollsBackOnBillingConflict(t *testing.T) {
	for _, release := range []bool{false, true} {
		t.Run(map[bool]string{false: "reserved", true: "released"}[release], func(t *testing.T) {
			a, _, _ := setup(t)
			ctx := context.Background()
			admin, _ := a.Sessions.Create(ctx, "admin", "admin")
			if _, e := a.Billing.Adjust(ctx, "user-a", "fund", "admin", "test credit", 1000); e != nil {
				t.Fatal(e)
			}
			j := core.NewJob("user-a", "resume-image", core.JobInput{Kind: "image", Model: "image-model"})
			j.CostUnits = 100
			if _, e := a.Store.CreateJob(ctx, j); e != nil {
				t.Fatal(e)
			}
			claimed, e := a.Store.Claim(ctx)
			if e != nil {
				t.Fatal(e)
			}
			claimed.HoldOnFailure = true
			if e = a.Store.Finish(ctx, claimed, "", "save interrupted"); e != nil {
				t.Fatal(e)
			}
			state := map[string]any{"phase": "polling", "startedAt": time.Now().Add(-2 * time.Hour), "taskId": "upstream-task", "result": "asset:output", "futureField": map[string]any{"exact": 9007199254740993}}
			before, e := a.Store.Put(ctx, "executions", core.Record{ID: j.ID, Data: core.Data(state)}, 0)
			if e != nil {
				t.Fatal(e)
			}
			if release {
				if e = a.Billing.ReleaseJob(ctx, j.ID, "admin", "已核实未生成"); e != nil {
					t.Fatal(e)
				}
			}
			w := call(a, "POST", "/api/admin/jobs/"+j.ID+"/resume", admin, "", nil)
			after, e := a.Store.Get(ctx, "executions", j.ID)
			if e != nil {
				t.Fatal(e)
			}
			current, _ := a.Store.Job(ctx, j.ID)
			if release {
				if w.Code != 409 || current.Status != "failed" || string(after.Data) != string(before.Data) || after.Version != before.Version {
					t.Fatalf("rejected resume changed execution: %d %s", w.Code, after.Data)
				}
				return
			}
			if w.Code != 200 || current.Status != "queued" {
				t.Fatal(w.Code, w.Body.String())
			}
			var old, next map[string]json.RawMessage
			_ = json.Unmarshal(before.Data, &old)
			_ = json.Unmarshal(after.Data, &next)
			for key, value := range old {
				if key != "startedAt" && string(next[key]) != string(value) {
					t.Fatalf("lost %s: %s", key, next[key])
				}
			}
			if string(next["startedAt"]) == string(old["startedAt"]) {
				t.Fatal("deadline not reset")
			}
		})
	}
}

func TestDuplicateSubmissionReturnsCurrentBillingState(t *testing.T) {
	a, user, _ := setup(t)
	ctx := context.Background()
	if _, err := a.Billing.Adjust(ctx, "user-a", "fund", "admin", "test credit", 1000); err != nil {
		t.Fatal(err)
	}
	in := core.JobInput{Kind: "image", Model: "image-model", Prompt: "original"}
	j := core.NewJob("user-a", "repeat-key", in)
	j.CostUnits = 500
	if _, err := a.Store.CreateJob(ctx, j); err != nil {
		t.Fatal(err)
	}
	w := call(a, "POST", "/api/jobs", user, "repeat-key", in)
	var returned core.Job
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &returned) != nil || returned.CostUnits != 500 || returned.BillingState != "reserved" {
		t.Fatalf("duplicate lost billing state: %d %s", w.Code, w.Body.String())
	}
}
