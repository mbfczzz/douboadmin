package store

import (
	"doubo/server/internal/core"
	"testing"
	"time"
)

func TestMySQLDashboardIncludesOldReservationsAndRecentSettlements(t *testing.T) {
	m := mysqlFixture(t)
	ctx := t.Context()
	before, err := m.Dashboard(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	old := time.Now().AddDate(0, 0, -40)
	add := func(status, state, kind string, units int64) {
		j := core.NewJob("points-"+core.NewID(), "history", core.JobInput{Kind: "image"})
		if _, err := m.CreateJob(ctx, j); err != nil {
			t.Fatal(err)
		}
		if _, err := m.db.ExecContext(ctx, "UPDATE jobs SET status=?,created_at=?,updated_at=? WHERE id=?", status, old, old, j.ID); err != nil {
			t.Fatal(err)
		}
		row, _ := m.Get(ctx, "job_billing", j.ID)
		row.Data = core.Data(core.JobBilling{State: state, Units: units})
		if _, err := m.Put(ctx, "job_billing", row, row.Version); err != nil {
			t.Fatal(err)
		}
		if _, err := m.db.ExecContext(ctx, "UPDATE job_billing SET created_at=? WHERE id=?", old, j.ID); err != nil {
			t.Fatal(err)
		}
		if kind != "" {
			entry := core.LedgerEntry{UserID: j.UserID, Reference: "job:" + j.ID + ":settle", Kind: kind, HeldDelta: -units}
			if kind == "job_release" {
				entry.Reference = "job:" + j.ID + ":manual-release"
				entry.AvailableDelta = units
			}
			if _, err := m.Put(ctx, "wallet_ledger", core.Record{ID: core.NewID(), Owner: j.UserID, Data: core.Data(entry)}, 0); err != nil {
				t.Fatal(err)
			}
		}
	}
	add("succeeded", "charged", "job_charge", 1234)
	add("failed", "released", "job_release", 567)
	add("failed", "reserved", "", 890)
	after, err := m.Dashboard(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	a, b := after.Points, before.Points
	if a.SpentUnits-b.SpentUnits != 1234 || a.ImageUnits-b.ImageUnits != 1234 || a.ReleasedUnits-b.ReleasedUnits != 567 || a.ReservedUnits-b.ReservedUnits != 890 || a.ChargedJobs-b.ChargedJobs != 1 || a.ReleasedJobs-b.ReleasedJobs != 1 || a.ReservedJobs-b.ReservedJobs != 1 {
		t.Fatalf("before=%+v after=%+v", b, a)
	}
}
