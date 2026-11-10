package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"testing"
)

func TestUserJobPagesPassTwoHundredAndRejectForeignOwner(t *testing.T) {
	a, user, admin := activationFixture(t)
	activate(t, a, "user-a")
	for i := 0; i < 205; i++ {
		j := core.NewJob("user-a", fmt.Sprintf("page-job-%d", i), core.JobInput{Kind: "image", Model: "demo-image", Prompt: "page marker"})
		if _, e := a.Store.CreateJob(t.Context(), j); e != nil {
			t.Fatal(e)
		}
	}
	for _, token := range []string{user, admin} {
		path := "/api/jobs?page=11&size=20&q=marker"
		if token == admin {
			path = "/api/admin/jobs?page=11&size=20&q=marker"
		}
		w := call(a, "GET", path, token, "", nil)
		var page core.JobPage
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		if page.Total != 205 || len(page.Items) != 5 {
			t.Fatal(page.Total, len(page.Items))
		}
	}
	w := call(a, "GET", "/api/admin/users/user-a/models?page=11&size=20", admin, "", nil)
	var result struct {
		Models []modelUse `json:"models"`
		Jobs   []modelJob `json:"jobs"`
		Total  int        `json:"total"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if result.Total != 205 || len(result.Jobs) != 5 || result.Models[0].Calls != 205 {
		t.Fatal(result.Total, len(result.Jobs), result.Models)
	}
}
