package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestRetiredMixAPIsDoNotCreateJobsOrReservePoints(t *testing.T) {
	a, user, _ := setup(t)
	ctx := context.Background()
	if _, err := a.Billing.Adjust(ctx, "user-a", "fund-retired", "admin", "test credit", 1000); err != nil {
		t.Fatal(err)
	}
	input := core.JobInput{Kind: "mix", Model: "local-mix", Prompt: "legacy input"}
	for _, path := range []string{"/api/jobs", "/api/jobs/quote"} {
		w := call(a, "POST", path, user, "retired-mix-request", input)
		if w.Code != 400 {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	jobs, err := a.Store.Jobs(ctx, "user-a")
	if err != nil || len(jobs) != 0 {
		t.Fatalf("unexpected jobs: %v %v", jobs, err)
	}
	wallet, err := a.Billing.Wallet(ctx, "user-a")
	if err != nil || wallet.Available != 1000 || wallet.Held != 0 {
		t.Fatalf("wallet changed: %+v %v", wallet, err)
	}
	for _, path := range []string{"/api/mix/config", "/api/music", "/api/admin/music"} {
		if w := call(a, "GET", path, user, "", nil); w.Code != 404 {
			t.Fatalf("retired endpoint %s returned %d", path, w.Code)
		}
	}
}

func TestMixPageGetsUnavailableCapabilityAndNoRetiredSettings(t *testing.T) {
	a, user, _ := setup(t)
	w := call(a, "GET", "/api/config", user, "", nil)
	var config struct {
		MixAvailable bool   `json:"mixAvailable"`
		MixMessage   string `json:"mixMessage"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &config) != nil || config.MixAvailable || config.MixMessage == "" {
		t.Fatal(w.Code, w.Body.String())
	}
	settings := core.Data(map[string]any{"pointsPerYuan": 100, "mixPoints": 10, "ttsModel": "retired", "rewriteModel": "retired"})
	if _, err := a.Store.Put(context.Background(), "settings", core.Record{ID: "platform", Data: settings}, 0); err != nil {
		t.Fatal(err)
	}
	admin, _ := a.Sessions.Create(context.Background(), "admin", "admin")
	w = call(a, "GET", "/api/admin/platform", admin, "", nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, key := range []string{"mixPoints", "ttsModel", "rewriteModel", "asr"} {
		if strings.Contains(w.Body.String(), `"`+key+`"`) {
			t.Fatalf("retired setting exposed: %s", key)
		}
	}
}

func TestRetiredMixJobCannotBeRetriedOrResumed(t *testing.T) {
	a, user, _ := setup(t)
	ctx := context.Background()
	j := core.NewJob("user-a", "legacy-mix-job", core.JobInput{Kind: "mix", Model: "local-mix"})
	if _, err := a.Store.CreateJob(ctx, j); err != nil {
		t.Fatal(err)
	}
	claimed, err := a.Store.Claim(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := a.Store.Finish(ctx, claimed, "", "retired service"); err != nil {
		t.Fatal(err)
	}
	_, err = a.Store.Put(ctx, "executions", core.Record{ID: j.ID, Data: core.Data(map[string]any{"phase": "polling", "taskId": "legacy"})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	w := call(a, "POST", "/api/jobs/"+j.ID+"/retry", user, "legacy-mix-retry", map[string]any{})
	if w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	admin, _ := a.Sessions.Create(ctx, "admin", "admin")
	w = call(a, "POST", "/api/admin/jobs/"+j.ID+"/resume", admin, "", nil)
	if w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	job, _ := a.Store.Job(ctx, j.ID)
	if job.Status != "failed" {
		t.Fatal("retired job was queued again")
	}
}
