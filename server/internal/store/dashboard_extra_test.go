package store

import (
	"context"
	"doubo/server/internal/core"
	"testing"
	"time"
)

func TestDashboardBreakdown(t *testing.T) {
	r := newReport(30)
	now := time.Now().UTC()
	old := now.AddDate(0, 0, -60)
	rec := func(ns, id, owner string, at time.Time, data any) {
		r.record(ns, core.Record{ID: id, Owner: owner, CreatedAt: at, Data: core.Data(data)})
	}
	rec("users", "u1", "u1", now, map[string]string{})
	rec("users", "u0", "u0", old, map[string]string{})
	rec("partners", "p1", "root", old, core.Partner{Name: "华东"})
	rec("daily_activity", "a1", "u1", now, map[string]string{})
	rec("daily_activity", "a2", "u1", now, map[string]string{})
	rec("orders", "o1", "u1", now, core.Order{UserID: "u1", AmountFen: 990, PointsUnits: 100000, Channel: "wechat_virtual", PaidAt: &now})
	rec("orders", "o2", "u1", now, core.Order{UserID: "u1", AmountFen: 990, Channel: "wechat_virtual"})
	rec("refunds", "f1", "u1", now, core.Refund{Status: "succeeded", CompletedAt: &now, AmountFen: 990})
	// Only approvals in the period count, read from the append-only audit
	// rows: a 会员 and a provider owner; an old approval and other audit
	// kinds do not.
	approved := func(id, user, role string, at time.Time) {
		rec("partner_audit", id, user, at, map[string]any{"kind": "registration_approved", "data": core.Registration{Role: role, PartnerID: "p1", Status: "approved"}})
	}
	approved("a-u1", "u1", "member", now)
	approved("a-u2", "u2", "s1", now)
	approved("a-u0", "u0", "member", old)
	rec("partner_audit", "a-u3", "u3", now, map[string]any{"kind": "registration_rejected", "data": core.Registration{Role: "member", PartnerID: "p1"}})
	// Spent points come from job_billing (the MySQL job row has no cost), so
	// the job's own CostUnits is deliberately left empty here.
	job := func(kind, status string, cost int64, took time.Duration) {
		id := kind + "-" + status
		state := map[string]string{"succeeded": "charged", "failed": "released"}[status]
		rec("job_billing", id, "u1", now, core.JobBilling{Units: cost, State: state})
		r.job(core.Job{ID: id, UserID: "u1", Input: core.JobInput{Kind: kind}, Status: status, CreatedAt: now.Add(-took), UpdatedAt: now})
	}
	job("image", "succeeded", 200, 20*time.Second)
	job("image", "failed", 200, time.Second)
	job("video", "succeeded", 1000, 100*time.Second)
	job("import", "succeeded", 0, time.Second)
	b := r.result().Breakdown
	if b.TotalUsers != 2 || b.ActiveUsers != 1 || b.CreatorUsers != 1 || b.Payers != 1 {
		t.Fatal("users", b.TotalUsers, b.ActiveUsers, b.CreatorUsers, b.Payers)
	}
	if b.OrdersCreated != 2 || b.OrdersPaid != 1 || b.PointsSold != 100000 || b.Refunds != 1 || b.Channels["wechat_virtual"].AmountFen != 990 {
		t.Fatal("orders", b)
	}
	img, video := b.Kinds["image"], b.Kinds["video"]
	if img.Jobs != 2 || img.Succeeded != 1 || img.Failed != 1 || img.SpentUnits != 200 || video.DurationMs != 100000 || b.Kinds["import"] != nil {
		t.Fatal("kinds", img, video)
	}
	var hours int64
	for _, n := range b.Hours {
		hours += n
	}
	if hours != 3 {
		t.Fatal("hours", b.Hours)
	}
	if b.MemberActivations != 1 || b.OwnerActivations != 1 {
		t.Fatal("activations", b)
	}
	if len(b.Providers) != 1 || b.Providers[0].Name != "华东" || b.Providers[0].Activations != 1 {
		t.Fatal("providers", b.Providers)
	}
}

// The MySQL query must select every namespace the breakdown reads.
func TestMySQLDashboardBreakdownQuery(t *testing.T) {
	m := mysqlFixture(t)
	ctx, now, id := context.Background(), time.Now().UTC(), core.NewID()
	put := func(ns, rid, owner string, data any) {
		if _, err := m.Put(ctx, ns, core.Record{ID: rid, Owner: owner, Data: core.Data(data)}, 0); err != nil {
			t.Fatal(err)
		}
	}
	put("users", "dash-u-"+id, "dash-u-"+id, map[string]string{})
	put("partners", "dash-p-"+id, "root", core.Partner{Name: "看板服务商"})
	put("partner_audit", "dash-a-"+id, "dash-u-"+id, map[string]any{"kind": "registration_approved", "data": core.Registration{Role: "member", PartnerID: "dash-p-" + id, Status: "approved"}})
	put("orders", "dash-o-"+id, "dash-u-"+id, core.Order{UserID: "dash-u-" + id, AmountFen: 500, Channel: "wechat_virtual", PaidAt: &now})
	out, err := m.Dashboard(ctx, 7)
	if err != nil {
		t.Fatal(err)
	}
	b := out.Breakdown
	found := false
	for _, p := range b.Providers {
		found = found || (p.ID == "dash-p-"+id && p.Name == "看板服务商")
	}
	if !found || b.TotalUsers < 1 || b.MemberActivations < 1 || b.Channels["wechat_virtual"] == nil || b.OrdersPaid < 1 {
		t.Fatal("mysql breakdown", b)
	}
}
