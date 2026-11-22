package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestDashboardPointsUseCommittedJobAccounting(t *testing.T) {
	a, _, admin := activationFixture(t)
	ctx := t.Context()
	if _, err := a.Billing.Adjust(ctx, "point-report", "initial", "admin", "test", 10000); err != nil {
		t.Fatal(err)
	}
	create := func(id, kind string, cost int64) core.Job {
		j := core.NewJob("point-report", id, core.JobInput{Kind: kind})
		j.CostUnits = cost
		if _, err := a.Store.CreateJob(ctx, j); err != nil {
			t.Fatal(err)
		}
		return j
	}
	finish := func(id, kind string, cost int64, failure string, hold bool) {
		create(id, kind, cost)
		j, err := a.Store.Claim(ctx)
		if err != nil {
			t.Fatal(err)
		}
		j.HoldOnFailure = hold
		if err = a.Store.Finish(ctx, j, "result", failure); err != nil {
			t.Fatal(err)
		}
	}
	finish("image", "image", 300, "", false)
	finish("video", "video", 900, "", false)
	chat := create("chat", "chat", 1000)
	claimed, err := a.Store.ClaimChat(ctx)
	if err != nil {
		t.Fatal(err)
	}
	row, _ := a.Store.Get(ctx, "job_billing", chat.ID)
	used := int64(250)
	row.Data = core.Data(core.JobBilling{State: "reserved", Units: 1000, UsedUnits: &used})
	if _, err = a.Store.Put(ctx, "job_billing", row, row.Version); err != nil {
		t.Fatal(err)
	}
	if err = a.Store.Finish(ctx, claimed, "reply", ""); err != nil {
		t.Fatal(err)
	}
	finish("failed", "image", 500, "failed", false)
	finish("unknown", "video", 700, "need verification", true)
	create("running", "video", 400)
	if _, err = a.Store.Claim(ctx); err != nil {
		t.Fatal(err)
	}
	create("queued", "image", 600)
	read := func(want core.PointStats) {
		t.Helper()
		w := call(a, "GET", "/api/admin/dashboard?days=1", admin, "", nil)
		var report core.Dashboard
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &report) != nil || report.Points != want {
			t.Fatalf("status=%d points=%+v want=%+v body=%s", w.Code, report.Points, want, w.Body.String())
		}
	}
	want := core.PointStats{SpentUnits: 1450, ImageUnits: 300, VideoUnits: 900, OtherUnits: 250, ChargedJobs: 3, ReservedUnits: 1700, ReservedJobs: 3, ReleasedUnits: 500, ReleasedJobs: 1}
	read(want)
	unknown := core.NewJob("point-report", "unknown", core.JobInput{})
	if err = a.Billing.ReleaseJob(ctx, unknown.ID, "admin", "已核实未生成"); err != nil {
		t.Fatal(err)
	}
	want.ReservedUnits, want.ReservedJobs, want.ReleasedUnits, want.ReleasedJobs = 1000, 2, 1200, 2
	read(want)
}
