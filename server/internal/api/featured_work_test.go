package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func featuredFixture(t *testing.T) (*Server, string, string, []core.Job) {
	t.Helper()
	a, user, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	_, err := a.Store.Put(t.Context(), "users", core.Record{ID: "user-a", Data: core.Data(map[string]string{"name": "private user"})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	jobs := []core.Job{}
	for _, kind := range []string{"image", "video", "mix"} {
		j, err := a.Store.CreateJob(t.Context(), core.NewJob("user-a", "featured-"+kind, core.JobInput{Kind: kind, Prompt: "private prompt", Assets: []string{"private-asset"}}))
		if err != nil {
			t.Fatal(err)
		}
		claimed, err := a.Store.Claim(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		result := "https://fixture.test/video.mp4"
		if kind == "image" {
			result = core.PackResults([]string{"https://fixture.test/1.png", "https://fixture.test/2.png", "https://fixture.test/3.png", "https://fixture.test/4.png"})
		}
		if err = a.Store.Finish(t.Context(), claimed, result, ""); err != nil {
			t.Fatal(err)
		}
		j, _ = a.Store.Job(t.Context(), j.ID)
		jobs = append(jobs, j)
	}
	return a, user, admin, jobs
}

func TestFeaturedWorksPublicationPrivacyPaginationAndWithdrawal(t *testing.T) {
	a, user, admin, jobs := featuredFixture(t)
	for _, j := range jobs {
		path := "/api/admin/works/" + j.ID + "/featured"
		if w := call(a, "PUT", path, user, "", map[string]any{"featured": true, "version": 0}); w.Code != 403 {
			t.Fatal("user can feature works", w.Code)
		}
		if w := call(a, "PUT", path, admin, "", map[string]any{"featured": true, "version": 0}); w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		if w := call(a, "PUT", path, admin, "", map[string]any{"featured": false, "version": 0}); w.Code != 409 {
			t.Fatal("stale version accepted", w.Code)
		}
	}
	w := call(a, "GET", "/api/featured-works?page=1&size=2", "", "", nil)
	var page struct {
		Items []featuredWorkView `json:"items"`
		Total int                `json:"total"`
	}
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || w.Code != 200 || page.Total != 3 || len(page.Items) != 2 {
		t.Fatal(w.Body.String())
	}
	for _, secret := range []string{"user-a", "private prompt", "private-asset", "costUnits", "workMetaVersion"} {
		if strings.Contains(w.Body.String(), secret) {
			t.Fatal("private data published", secret)
		}
	}
	w = call(a, "GET", "/api/featured-works?kind=video", "", "", nil)
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 2 {
		t.Fatal(w.Body.String())
	}
	w = call(a, "GET", "/api/featured-works/"+jobs[0].ID, "", "", nil)
	var detail featuredWorkView
	if json.Unmarshal(w.Body.Bytes(), &detail) != nil || len(detail.Results) != 4 || detail.Result != detail.Results[0] {
		t.Fatal(w.Body.String())
	}
	row, _ := a.Store.Get(t.Context(), "work_meta", jobs[0].ID)
	if w = call(a, "PUT", "/api/admin/works/"+jobs[0].ID+"/featured", admin, "", map[string]any{"featured": false, "version": row.Version}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = call(a, "GET", "/api/featured-works/"+jobs[0].ID, "", "", nil); w.Code != 404 {
		t.Fatal("withdrawn work still public")
	}
	if w = call(a, "DELETE", "/api/works/"+jobs[1].ID, user, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = call(a, "GET", "/api/featured-works/"+jobs[1].ID, "", "", nil); w.Code != 404 {
		t.Fatal("deleted work still public")
	}
	w = call(a, "GET", "/api/featured-works", "", "", nil)
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 1 {
		t.Fatal(w.Body.String())
	}
	profile, _ := a.Store.Get(t.Context(), "users", "user-a")
	profile.Data = core.Data(map[string]bool{"disabled": true})
	_, _ = a.Store.Put(t.Context(), "users", profile, profile.Version)
	w = call(a, "GET", "/api/featured-works", "", "", nil)
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 0 {
		t.Fatal("disabled owner's work remained public", w.Body.String())
	}
}

func TestFeaturedWorksGuardInvalidRecordsAndPageBeyondEnd(t *testing.T) {
	a, _, admin, jobs := featuredFixture(t)
	path := "/api/admin/works/" + jobs[0].ID + "/featured"
	if w := call(a, "PUT", path, "", "", map[string]any{"featured": true, "version": 0}); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := call(a, "PUT", path, admin, "", map[string]any{"featured": true}); w.Code != 400 {
		t.Fatal("missing version accepted")
	}
	if w := call(a, "PUT", path, admin, "", map[string]any{"version": 0}); w.Code != 400 {
		t.Fatal("missing featured state accepted")
	}
	if w := call(a, "GET", "/api/featured-works/"+jobs[0].ID, "", "", nil); w.Code != 404 {
		t.Fatal("unfeatured work exposed")
	}
	for _, query := range []string{"page=0", "kind=chat", "size=101"} {
		if w := call(a, "GET", "/api/featured-works?"+query, "", "", nil); w.Code != 400 {
			t.Fatal(query, w.Code)
		}
	}
	w := call(a, "GET", "/api/featured-works?page=100", "", "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"items":[]`) {
		t.Fatal(w.Body.String())
	}
	for _, kind := range []string{"image", "chat"} {
		j, err := a.Store.CreateJob(t.Context(), core.NewJob("user-a", "pending-"+kind, core.JobInput{Kind: kind}))
		if err != nil {
			t.Fatal(err)
		}
		w = call(a, "PUT", fmt.Sprintf("/api/admin/works/%s/featured", j.ID), admin, "", map[string]any{"featured": true, "version": 0})
		if w.Code != 409 {
			t.Fatal("unfinished/unsupported task published", w.Code)
		}
	}
}
