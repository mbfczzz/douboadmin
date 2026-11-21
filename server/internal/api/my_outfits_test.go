package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

// 我的服装: an uploaded picture is ready at once; an AI job shows 生成中
// until its picture is in (or why it failed); only the owner sees, adds
// from their own files and jobs, or deletes.
func TestMyOutfitsUploadAndAI(t *testing.T) {
	a, one, two := setup(t)
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "pic", Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/a/pic.jpg", "type": "image/jpeg"})}, 0)
	add := func(token string, body map[string]any) int {
		return call(a, "POST", "/api/my-outfits", token, "", body).Code
	}
	if add(two, map[string]any{"asset": "pic"}) != 400 {
		t.Fatal("someone else's picture accepted")
	}
	if add(one, map[string]any{"asset": "pic", "title": "通勤风衣"}) != 201 {
		t.Fatal("upload refused")
	}
	j := core.NewJob("user-a", "outfit-ai-0001", core.JobInput{Kind: "image", Model: "demo-image", Prompt: "生成服装图"})
	j, _ = a.Store.CreateJob(t.Context(), j)
	bad := core.NewJob("user-a", "outfit-ai-0002", core.JobInput{Kind: "image", Model: "demo-image", Prompt: "另一张"})
	bad, _ = a.Store.CreateJob(t.Context(), bad)
	if add(two, map[string]any{"job": j.ID}) != 400 {
		t.Fatal("someone else's job accepted")
	}
	if add(one, map[string]any{"job": j.ID}) != 201 || add(one, map[string]any{"job": bad.ID}) != 201 {
		t.Fatal("ai refused")
	}
	list := func(token string) []myOutfitView {
		var r struct{ Items []myOutfitView }
		_ = json.Unmarshal(call(a, "GET", "/api/my-outfits", token, "", nil).Body.Bytes(), &r)
		return r.Items
	}
	status := func() map[string]string {
		out := map[string]string{}
		for _, o := range list(one) {
			out[o.Title] = o.Status
		}
		return out
	}
	if s := status(); s["通勤风衣"] != "ready" || s["AI 生成的服装"] != "drawing" || len(list(two)) != 0 {
		t.Fatal(s)
	}
	// The worker finishes one and fails the other.
	first, _ := a.Store.Claim(t.Context())
	second, _ := a.Store.Claim(t.Context())
	byID := map[string]core.Job{first.ID: first, second.ID: second}
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "drawn", Owner: "user-a", Data: core.Data(map[string]any{"key": "results/a/o.png", "type": "image/png"})}, 0)
	_ = a.Store.Finish(t.Context(), byID[j.ID], "asset:drawn", "")
	_ = a.Store.Finish(t.Context(), byID[bad.ID], "", "上游繁忙")
	var ready, failed myOutfitView
	for _, o := range list(one) {
		if o.Source == "ai" && o.Status == "ready" {
			ready = o
		}
		if o.Status == "failed" {
			failed = o
		}
	}
	if ready.AssetID != "drawn" || ready.Image != "/media/results/a/o.png" || failed.Error == "" {
		t.Fatalf("%+v %+v", ready, failed)
	}
	if w := call(a, "DELETE", "/api/my-outfits/"+failed.ID, two, "", nil); w.Code != 404 {
		t.Fatal("deleted by someone else")
	}
	if w := call(a, "DELETE", "/api/my-outfits/"+failed.ID, one, "", nil); w.Code != 204 || len(list(one)) != 2 {
		t.Fatal("not deleted", w.Code)
	}
}
