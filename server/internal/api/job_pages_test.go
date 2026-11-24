package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
	"time"
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

func TestJobQueryParsesModelAndShanghaiDateRange(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/admin/jobs?page=1&model=model-a&from=2026-11-20&to=2026-11-22", nil)
	w := httptest.NewRecorder()
	q, ok := jobQuery(w, r)
	if !ok || q.Model != "model-a" || q.CreatedFrom.UTC() != (time.Date(2026, 11, 19, 16, 0, 0, 0, time.UTC)) || q.CreatedBefore.UTC() != (time.Date(2026, 11, 22, 16, 0, 0, 0, time.UTC)) {
		t.Fatal(ok, q, w.Body.String())
	}
	bad := httptest.NewRequest("GET", "/api/admin/jobs?page=1&from=2026-13-40", nil)
	if _, ok = jobQuery(httptest.NewRecorder(), bad); ok {
		t.Fatal("invalid date accepted")
	}
}

func TestAdminJobPageIncludesSettledPoints(t *testing.T) {
	a, _, admin := activationFixture(t)
	user, err := a.Store.Get(t.Context(), "users", "user-a")
	if err != nil {
		t.Fatal(err)
	}
	user.Data = core.Data(map[string]string{
		"nickname": "创作者昵称", "name": "创作者姓名", "phone": "13900139000",
	})
	if _, err = a.Store.Put(t.Context(), "users", user, user.Version); err != nil {
		t.Fatal(err)
	}
	j := core.NewJob("user-a", "points-page", core.JobInput{Kind: "video", Model: "demo-video", Prompt: "points marker"})
	j.Status = "succeeded"
	if _, err := a.Store.CreateJob(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	bill, err := a.Store.Get(t.Context(), "job_billing", j.ID)
	if err != nil {
		t.Fatal(err)
	}
	bill.Data = core.Data(core.JobBilling{State: "charged", Units: 1234})
	if _, err = a.Store.Put(t.Context(), "job_billing", bill, bill.Version); err != nil {
		t.Fatal(err)
	}
	w := call(a, "GET", "/api/admin/jobs?page=1&q=points%20marker", admin, "", nil)
	var page core.JobPage
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || len(page.Items) != 1 {
		t.Fatal(w.Code, w.Body.String())
	}
	if page.Items[0].CostUnits != 1234 || page.Items[0].BillingState != "charged" {
		t.Fatal(page.Items[0].CostUnits, page.Items[0].BillingState)
	}
	if page.Items[0].UserName != "创作者姓名" || page.Items[0].UserPhone != "13900139000" {
		t.Fatal(page.Items[0].UserName, page.Items[0].UserPhone)
	}
}
