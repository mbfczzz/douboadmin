package store

import (
	"doubo/server/internal/core"
	"testing"
	"time"
)

func TestPreviousPeriodTotals(t *testing.T) {
	r := newReport(7)
	now := time.Now()
	before := now.AddDate(0, 0, -8)               // inside the previous 7 days
	tooOld := now.AddDate(0, 0, -20)              // outside both periods
	later := now.AddDate(0, 0, -7).Add(time.Hour) // previous period, but after "now - 7 days"
	rec := func(ns, id, owner string, at time.Time, data any) {
		r.record(ns, core.Record{ID: id, Owner: owner, CreatedAt: at, Data: core.Data(data)})
	}
	rec("users", "u-now", "u-now", now, map[string]string{})
	rec("users", "u-prev", "u-prev", before, map[string]string{})
	rec("users", "u-old", "u-old", tooOld, map[string]string{})
	rec("users", "u-late", "u-late", later, map[string]string{})
	rec("daily_activity", "a1", "u-prev", before, map[string]string{})
	rec("daily_activity", "a2", "u-prev", before.Add(time.Hour), map[string]string{})
	rec("orders", "o1", "u-prev", before, core.Order{AmountFen: 500, PaidAt: &before})
	rec("visits", "v1", "", before, core.Visit{Visitor: "x", Pages: 3, FirstAt: before})
	r.job(core.Job{ID: "j1", Status: "succeeded", Input: core.JobInput{Kind: "image"}, CreatedAt: before})
	r.job(core.Job{ID: "j2", Status: "queued", Input: core.JobInput{Kind: "import"}, CreatedAt: before})
	out := r.result()
	p := out.Previous
	if p == nil || p.NewUsers != 1 || p.ActiveUsers != 1 || p.PaidFen != 500 || p.RevenueFen != 500 || p.Jobs != 1 || p.Succeeded != 1 || p.PV != 3 || p.UV != 1 {
		t.Fatalf("previous %+v", p)
	}
	var current int64
	for _, d := range out.Days {
		current += d.NewUsers
	}
	if current != 1 {
		t.Fatal("current period picked up older rows", current)
	}
}
