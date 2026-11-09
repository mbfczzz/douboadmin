package store

import (
	"doubo/server/internal/core"
	"testing"
	"time"
)

func TestTodayReportHasHourlySeries(t *testing.T) {
	now := time.Now().In(reportZone)
	at := time.Date(now.Year(), now.Month(), now.Day(), 9, 30, 0, 0, reportZone)
	if now.Hour() < 9 {
		at = now // early in the day: use the current hour
	}
	r := newReport(1)
	rec := func(ns, id string, when time.Time, data any) {
		r.record(ns, core.Record{ID: id, Owner: "u1", CreatedAt: when, Data: core.Data(data)})
	}
	rec("users", "u1", at, map[string]string{})
	rec("orders", "o1", at, core.Order{AmountFen: 990, PaidAt: &at})
	rec("visits", "v1", at, core.Visit{Day: at.Format("2006-01-02"), Visitor: "x", Pages: 3, FirstAt: at, LastAt: at})
	yesterday := at.AddDate(0, 0, -1)
	rec("users", "u0", yesterday, map[string]string{})
	r.job(core.Job{ID: "j1", Status: "failed", Input: core.JobInput{Kind: "image"}, CreatedAt: at})
	r.job(core.Job{ID: "j2", Status: "queued", Input: core.JobInput{Kind: "import"}, CreatedAt: at})
	out := r.result()
	if len(out.Hours) != 24 || out.Hours[0].Date != "00:00" {
		t.Fatal("hours", len(out.Hours))
	}
	h := out.Hours[at.Hour()]
	if h.NewUsers != 1 || h.Jobs != 1 || h.Failed != 1 || h.PaidFen != 990 || h.RevenueFen != 990 || h.PV != 3 || h.UV != 1 {
		t.Fatalf("hour bucket %+v", h)
	}
	var total int64
	for _, b := range out.Hours {
		total += b.NewUsers
	}
	if total != out.Days[0].NewUsers || total != 1 {
		t.Fatal("hours must add up to the day", total, out.Days[0].NewUsers)
	}
	if newReport(7).result().Hours != nil {
		t.Fatal("longer periods carry no hourly series")
	}
}
