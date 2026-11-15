package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"testing"
)

func TestRunningTaskCounterUsesTotalAndExcludesOtherUsersChatAndImports(t *testing.T) {
	a, user, other := setup(t)
	n := 0
	add := func(owner, kind, status string) {
		t.Helper()
		n++
		j := core.NewJob(owner, fmt.Sprintf("count-%d", n), core.JobInput{Kind: kind, Model: "demo-image"})
		if _, err := a.Store.CreateJob(t.Context(), j); err != nil {
			t.Fatal(err)
		}
		if status == "queued" {
			return
		}
		claimed, err := a.Store.Claim(t.Context())
		if err != nil || claimed.ID != j.ID {
			t.Fatal("fixture claim mismatch", err)
		}
		if status == "succeeded" {
			if err = a.Store.Finish(t.Context(), claimed, "https://fixture.test/result.png", ""); err != nil {
				t.Fatal(err)
			}
		}
		if status == "failed" {
			if err = a.Store.Finish(t.Context(), claimed, "", "failed"); err != nil {
				t.Fatal(err)
			}
		}
	}
	for i := 0; i < 27; i++ {
		add("user-a", "image", "running")
	}
	add("user-a", "chat", "running")
	add("user-a", "import", "running")
	add("user-b", "video", "running")
	add("user-a", "image", "succeeded")
	add("user-a", "image", "failed")
	add("user-a", "image", "queued")
	path := "/api/jobs?page=1&size=1&status=running&excludeChat=true&excludeImport=true"
	for _, tt := range []struct {
		token string
		total int
	}{{user, 27}, {other, 1}} {
		w := call(a, "GET", path, tt.token, "", nil)
		var result core.JobPage
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.Total != tt.total || len(result.Items) != 1 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if w := call(a, "GET", path, "", "", nil); w.Code != 401 {
		t.Fatal("anonymous count allowed")
	}
}
