package store

import (
	"doubo/server/internal/core"
	"testing"
	"time"
)

func TestDashboardPointsFollowActualSettlementNotSubmissionOrQuote(t *testing.T) {
	m := NewMemory()
	now := time.Now().In(reportZone)
	at := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, reportZone).UTC()
	old := at.AddDate(0, 0, -40)
	add := func(id, kind, status, state string, units int64, created, settled time.Time, entry core.LedgerEntry) {
		m.jobs[id] = core.Job{ID: id, UserID: "u", Input: core.JobInput{Kind: kind}, Status: status, CostUnits: 999999, CreatedAt: created, UpdatedAt: created}
		m.records["job_billing:"+id] = core.Record{ID: id, Owner: "u", CreatedAt: created, Data: core.Data(core.JobBilling{State: state, Units: units, ReservedUnits: 999999})}
		if entry.Kind != "" {
			if entry.Reference == "" {
				entry.Reference = "job:" + id + ":settle"
			}
			if entry.UserID == "" {
				entry.UserID = "u"
			}
			m.records["wallet_ledger:"+id] = core.Record{ID: id, Owner: entry.UserID, CreatedAt: settled, Data: core.Data(entry)}
		}
	}
	charge := func(units int64) core.LedgerEntry { return core.LedgerEntry{Kind: "job_charge", HeldDelta: -units} }
	// A 40-day-old task settles at Beijing midnight. UpdatedAt and quote are
	// deliberately unrelated: neither is the charge amount or settlement date.
	add("cross-day", "image", "succeeded", "charged", 1234, old, at, charge(1234))
	add("video", "video", "succeeded", "charged", 20000, at, at, charge(20000))
	add("mix", "mix", "succeeded", "charged", 1000, at, at, charge(1000))
	add("chat", "chat", "succeeded", "charged", 150, at, at, core.LedgerEntry{Kind: "job_usage", HeldDelta: -1000, AvailableDelta: 850})
	add("audio", "audio", "succeeded", "charged", 50, at, at, charge(50))
	for i, status := range []string{"running", "queued", "failed", "succeeded"} {
		add(status+"-hold", "image", status, "reserved", int64(5000+1000*i), at, at, core.LedgerEntry{})
	}
	add("old-hold", "video", "failed", "reserved", 100, old, at, core.LedgerEntry{})
	add("failed-charged", "image", "failed", "charged", 9000, at, at, charge(9000))
	add("no-ledger", "image", "succeeded", "charged", 9000, at, at, core.LedgerEntry{})
	add("wrong-user", "image", "succeeded", "charged", 9000, at, at, core.LedgerEntry{Kind: "job_charge", UserID: "other", HeldDelta: -9000})
	add("wrong-net", "chat", "succeeded", "charged", 9000, at, at, core.LedgerEntry{Kind: "job_usage", HeldDelta: -9000, AvailableDelta: 8000})
	add("free", "image", "succeeded", "free", 0, at, at, core.LedgerEntry{})
	add("import", "import", "succeeded", "charged", 9000, at, at, charge(9000))
	add("yesterday", "image", "succeeded", "charged", 500, at, at.Add(-time.Nanosecond), charge(500))
	add("future", "image", "succeeded", "charged", 500, at, at.AddDate(0, 0, 1), charge(500))
	add("auto-return", "image", "failed", "released", 300, at, at, core.LedgerEntry{Kind: "job_release", AvailableDelta: 300, HeldDelta: -300})
	add("manual-return", "video", "failed", "released", 400, old, at, core.LedgerEntry{Reference: "job:manual-return:manual-release", Kind: "job_release", AvailableDelta: 400, HeldDelta: -400})
	add("not-returned", "image", "failed", "released", 800, at, at, core.LedgerEntry{})
	out, err := m.Dashboard(t.Context(), 1)
	if err != nil {
		t.Fatal(err)
	}
	want := core.PointStats{SpentUnits: 22434, ImageUnits: 1234, VideoUnits: 21000, OtherUnits: 200, ChargedJobs: 5, ReservedUnits: 26100, ReservedJobs: 5, ReleasedUnits: 700, ReleasedJobs: 2}
	if out.Points != want || out.Days[0].SpentUnits != want.SpentUnits || out.Hours[0].SpentUnits != want.SpentUnits {
		t.Fatalf("points=%+v want=%+v day=%+v hour=%+v", out.Points, want, out.Days[0], out.Hours[0])
	}
	// Read-only refreshes do not consume holds or duplicate ledger amounts.
	again, err := m.Dashboard(t.Context(), 1)
	if err != nil || again.Points != want {
		t.Fatal(again.Points, err)
	}
	week, err := m.Dashboard(t.Context(), 7)
	if err != nil || week.Points.SpentUnits != want.SpentUnits+500 || week.Points.ReservedUnits != want.ReservedUnits {
		t.Fatal(week.Points, err)
	}
}

func TestDashboardPointsPreviousPeriodUsesSettlementDay(t *testing.T) {
	r := newReport(1)
	at := r.prev.from
	r.record("job_billing", core.Record{ID: "old", Owner: "u", CreatedAt: at.AddDate(0, 0, -40), Data: core.Data(core.JobBilling{State: "charged", Units: 425})})
	r.record("wallet_ledger", core.Record{ID: "settle", Owner: "u", CreatedAt: at, Data: core.Data(core.LedgerEntry{UserID: "u", Reference: "job:old:settle", Kind: "job_charge", HeldDelta: -425})})
	r.job(core.Job{ID: "old", UserID: "u", Input: core.JobInput{Kind: "video"}, Status: "succeeded", CreatedAt: at.AddDate(0, 0, -40)})
	out := r.result()
	if out.Previous.SpentUnits != 425 || out.Points.SpentUnits != 0 || out.Days[0].SpentUnits != 0 {
		t.Fatal(out.Previous, out.Points, out.Days)
	}
}
