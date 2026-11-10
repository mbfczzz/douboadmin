package store

import (
	"doubo/server/internal/core"
	"fmt"
	"testing"
	"time"
)

func TestJobPaginationFiltersBeforeLimitAndCountsAllHistory(t *testing.T) {
	m := NewMemory()
	stamp := time.Now().UTC()
	for i := 0; i < 501; i++ {
		j := core.NewJob("u", fmt.Sprintf("job-%d", i), core.JobInput{Kind: "image", Model: "image-model", Prompt: "needle"})
		j.Status = "succeeded"
		j.CreatedAt = stamp
		m.jobs[j.ID] = j
		if i < 2 {
			if _, e := m.Put(t.Context(), "work_meta", core.Record{ID: j.ID, Owner: "u", Data: core.Data(core.WorkMeta{Deleted: true})}, 0); e != nil {
				t.Fatal(e)
			}
		}
		if _, e := m.Put(t.Context(), "job_billing", core.Record{ID: j.ID, Owner: "u", Data: core.Data(core.JobBilling{State: "charged", Units: 100})}, 0); e != nil {
			t.Fatal(e)
		}
	}
	for i := 0; i < 220; i++ {
		j := core.NewJob("u", fmt.Sprintf("chat-%d", i), core.JobInput{Kind: "chat", Model: "chat-model"})
		j.CreatedAt = stamp.Add(time.Hour)
		m.jobs[j.ID] = j
	}
	ids := map[string]bool{}
	for n := 1; n <= 25; n++ {
		page, e := m.JobPage(t.Context(), core.JobQuery{User: "u", Works: true, Deleted: "active", Search: "needle", Page: n, Size: 20})
		if e != nil {
			t.Fatal(e)
		}
		if page.Total != 499 {
			t.Fatal(page.Total)
		}
		for _, j := range page.Items {
			if ids[j.ID] {
				t.Fatal("duplicate page row", j.ID)
			}
			ids[j.ID] = true
		}
	}
	if len(ids) != 499 {
		t.Fatal(len(ids))
	}
	stats, e := m.JobStats(t.Context(), "u")
	if e != nil || stats.Works != 499 {
		t.Fatal(stats, e)
	}
	models, e := m.JobModels(t.Context(), "u")
	if e != nil {
		t.Fatal(e)
	}
	if len(models) != 2 || models[0].Calls != 501 || models[0].PointsUnits != 50100 {
		t.Fatal(models)
	}
	page, e := m.JobPage(t.Context(), core.JobQuery{User: "other", Page: 1, Size: 20})
	if e != nil || page.Total != 0 {
		t.Fatal(page, e)
	}
}

func TestJobPageRejectsInvalidBoundaries(t *testing.T) {
	m := NewMemory()
	for _, q := range []core.JobQuery{{Page: 0, Size: 20}, {Page: 1, Size: 101}, {Page: 1, Size: 20, Deleted: "invalid"}} {
		if _, e := m.JobPage(t.Context(), q); e == nil {
			t.Fatal("invalid query accepted", q)
		}
	}
}
