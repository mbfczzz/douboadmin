package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMultiImageResultsAndSharingRespectOwnershipAndDeletion(t *testing.T) {
	a, user, other := setup(t)
	if _, err := a.Store.Put(t.Context(), "users", core.Record{ID: "user-a", Data: core.Data(map[string]any{"name": "测试用户"})}, 0); err != nil {
		t.Fatal(err)
	}
	j, err := a.Store.CreateJob(t.Context(), core.NewJob("user-a", "multi-image", core.JobInput{Kind: "image", Model: "demo-image"}))
	if err != nil {
		t.Fatal(err)
	}
	claimed, err := a.Store.Claim(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	refs := []string{}
	for i := 1; i <= 4; i++ {
		refs = append(refs, fmt.Sprintf("https://cdn.test/%d.png", i))
	}
	if err = a.Store.Finish(t.Context(), claimed, core.PackResults(refs), ""); err != nil {
		t.Fatal(err)
	}
	w := call(a, "GET", "/api/jobs/"+j.ID, user, "", nil)
	var result core.Job
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || len(result.Results) != 4 || result.Result != refs[0] {
		t.Fatal(w.Body.String())
	}
	if w = call(a, "GET", "/api/jobs/"+j.ID, other, "", nil); w.Code != 404 {
		t.Fatal("other user saw outputs")
	}
	w = call(a, "POST", "/api/shares", user, "", map[string]any{"jobId": j.ID})
	var share struct {
		Token string `json:"token"`
	}
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &share) != nil {
		t.Fatal(w.Body.String())
	}
	w = call(a, "GET", "/api/shares/"+share.Token, "", "", nil)
	var shared sharedWork
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &shared) != nil || len(shared.Results) != 4 {
		t.Fatal(w.Body.String())
	}
	html := httptest.NewRecorder()
	if err := sharePage.Execute(html, shared); err != nil || strings.Count(html.Body.String(), "<img ") != 4 {
		t.Fatal("HTML share lost images", err)
	}
	if w = call(a, "DELETE", "/api/works/"+j.ID, user, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = call(a, "GET", "/api/jobs/"+j.ID, user, "", nil)
	result = core.Job{}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.Result != "" || len(result.Results) != 0 {
		t.Fatal("deleted work leaked image URLs")
	}
	if w = call(a, "GET", "/api/shares/"+share.Token, "", "", nil); w.Code != 404 {
		t.Fatal("deleted work still shared")
	}
}
