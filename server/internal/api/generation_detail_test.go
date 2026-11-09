package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func TestGenerationDetailShowsInputsAndModelCalls(t *testing.T) {
	a, _, admin := activationFixture(t)
	ctx := t.Context()
	for id, typ := range map[string]string{"img-1": "image/png", "img-2": "image/jpeg", "vid-1": "video/mp4", "aud-1": "audio/mpeg"} {
		_, _ = a.Store.Put(ctx, "assets", core.Record{ID: id, Owner: "user-a", Data: core.Data(map[string]any{"type": typ, "size": 1024, "url": "/media/" + id})}, 0)
	}
	j := core.NewJob("user-a", "detail-key", core.JobInput{Kind: "video", Model: "demo-image", Prompt: "沙漠里跳舞", Mode: "multi_ref", Assets: []string{"img-1", "vid-1", "img-2", "aud-1"}})
	j.Error = "上游超时"
	if _, e := a.Store.CreateJob(ctx, j); e != nil {
		t.Fatal(e)
	}
	logs := a.Store.(store.AuditLogs)
	base := time.Now().Add(-time.Hour)
	var entries []core.AuditEntry
	entry := func(i int, method string, status int) core.AuditEntry {
		at := base.Add(time.Duration(i) * time.Second)
		return core.AuditEntry{ID: fmt.Sprintf("%013x%013d", at.UnixMilli(), i), At: at, Category: core.LogModel, Method: method, Status: status,
			ActorType: "user", ActorID: "user-a", TargetType: "job", TargetID: j.ID, Request: `{"prompt":"沙漠里跳舞"}`, Response: `{"task_id":"t1"}`}
	}
	entries = append(entries, entry(0, "POST", 200))
	for i := 1; i <= 130; i++ { // more polls than one page
		entries = append(entries, entry(i, "GET", 200))
	}
	entries = append(entries, entry(131, "GET", 502))
	if e := logs.AppendLogs(ctx, entries); e != nil {
		t.Fatal(e)
	}
	var out struct {
		Job    core.Job          `json:"job"`
		Inputs []genInput        `json:"inputs"`
		Calls  []core.AuditEntry `json:"calls"`
		Polls  int               `json:"polls"`
		More   bool              `json:"morePolls"`
	}
	w := call(a, "GET", "/api/admin/users/user-a/jobs/"+j.ID, admin, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	labels := []string{}
	for _, in := range out.Inputs {
		labels = append(labels, in.Label)
	}
	if fmt.Sprint(labels) != "[图片 1 视频 1 图片 2 音频 1]" || out.Inputs[1].Kind != "video" || out.Inputs[3].URL == "" {
		t.Fatal("inputs", out.Inputs)
	}
	// Submission + latest good poll + the failed poll, in time order, with bodies.
	if len(out.Calls) != 3 || out.Calls[0].Method != "POST" || out.Calls[0].Request == "" || out.Calls[2].Status != 502 || out.Polls != 100 || !out.More {
		t.Fatal("calls", len(out.Calls), out.Polls, out.More)
	}
	if out.Job.Error != "上游超时" || out.Job.Input.Prompt != "沙漠里跳舞" {
		t.Fatal("job", out.Job)
	}
	if w = call(a, "GET", "/api/admin/users/user-b/jobs/"+j.ID, admin, "", nil); w.Code != 404 {
		t.Fatal("job of another user opened", w.Code)
	}
	if w = call(a, "GET", "/api/admin/jobs/"+j.ID+"/detail", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
}
