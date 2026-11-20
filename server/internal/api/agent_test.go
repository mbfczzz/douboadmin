package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

type sessionRow struct {
	ID      string            `json:"id"`
	Version int64             `json:"version"`
	Data    core.AgentSession `json:"data"`
}

func TestAgentProjectsBelongToTheirOwnerAndScopeJobs(t *testing.T) {
	a, one, two := setup(t)
	ctx := t.Context()
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "pic", Owner: "user-a", Data: core.Data(map[string]any{"type": "image/png", "key": "a.png", "url": "/media/a.png"})}, 0)
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "theirs", Owner: "user-b", Data: core.Data(map[string]any{"type": "image/png", "key": "b.png"})}, 0)
	chat := core.Model{ID: "chat", Key: "chat-fixture", Name: "对话", Kind: "chat", Published: true, Available: true}
	_, _ = a.Store.Put(ctx, "models", core.Record{ID: "chat", Data: core.Data(chat)}, 0)

	if w := call(a, "GET", "/api/agent/skills", "", "", nil); w.Code != 200 || !json.Valid(w.Body.Bytes()) {
		t.Fatal("skills are shown before sign-in", w.Code)
	}
	if w := call(a, "GET", "/api/agent/sessions", "", "", nil); w.Code != 401 {
		t.Fatal("projects need sign-in", w.Code)
	}
	if w := call(a, "POST", "/api/agent/sessions", one, "", map[string]string{"skill": "nope"}); w.Code != 400 {
		t.Fatal("unknown skill", w.Code)
	}
	w := call(a, "POST", "/api/agent/sessions", one, "", map[string]string{"skill": "product"})
	var s sessionRow
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &s) != nil || s.Data.Title != "商品带货视频" || s.Data.Skill != "product" {
		t.Fatal(w.Code, w.Body.String())
	}
	path := "/api/agent/sessions/" + s.ID
	if w = call(a, "GET", path, two, "", nil); w.Code != 404 {
		t.Fatal("another user read the project", w.Code)
	}
	if w = call(a, "PUT", path, one, "", map[string]any{"version": s.Version, "assets": []string{"theirs"}}); w.Code != 400 {
		t.Fatal("someone else's material accepted", w.Code)
	}
	if w = call(a, "PUT", path, one, "", map[string]any{"version": s.Version, "assets": []string{"pic"}, "title": "  春季新品  "}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var full struct {
		Data   core.AgentSession `json:"data"`
		Assets []core.Record     `json:"assets"`
	}
	_ = json.Unmarshal(call(a, "GET", path, one, "", nil).Body.Bytes(), &full)
	if full.Data.Title != "春季新品" || len(full.Assets) != 1 || full.Assets[0].ID != "pic" {
		t.Fatal(full)
	}
	// Chat in a project is an Agent turn; others cannot post into it.
	in := core.JobInput{Kind: "chat", Model: "chat", Prompt: "写个方案", Assets: []string{}, SessionID: s.ID}
	if w = call(a, "POST", "/api/jobs", two, "agent-key-0002", in); w.Code != 400 {
		t.Fatal("posted into another user's project", w.Code)
	}
	if w = call(a, "POST", "/api/jobs", one, "agent-key-0001", in); w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	var job core.Job
	_ = json.Unmarshal(w.Body.Bytes(), &job)
	if job.Input.Purpose != "agent" || job.Input.SessionID != s.ID {
		t.Fatal(job.Input)
	}
	other := core.JobInput{Kind: "chat", Model: "chat", Prompt: "别的", Assets: []string{}}
	_ = call(a, "POST", "/api/jobs", one, "agent-key-0003", other)
	var page core.JobPage
	_ = json.Unmarshal(call(a, "GET", "/api/jobs?page=1&session="+s.ID, one, "", nil).Body.Bytes(), &page)
	if page.Total != 1 || page.Items[0].ID != job.ID {
		t.Fatal("project conversation", page.Total)
	}
	var list []sessionRow
	_ = json.Unmarshal(call(a, "GET", "/api/agent/sessions", one, "", nil).Body.Bytes(), &list)
	if len(list) != 1 || list[0].ID != s.ID {
		t.Fatal(list)
	}
	if w = call(a, "PUT", path, one, "", map[string]any{"version": list[0].Version, "deleted": true}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	_ = json.Unmarshal(call(a, "GET", "/api/agent/sessions", one, "", nil).Body.Bytes(), &list)
	if len(list) != 0 || call(a, "POST", "/api/jobs", one, "agent-key-0004", in).Code != 400 {
		t.Fatal("deleted project still usable")
	}
}
