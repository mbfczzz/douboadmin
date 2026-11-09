package store

import (
	"context"
	"doubo/server/internal/core"
	"math"
	"testing"
	"time"
)

func dayKey(t time.Time) string { return t.In(reportZone).Format("2006-01-02") }

func visitRow(day, visitor, entry string, scene int, platform string, seconds int, counts map[string]int64) core.Visit {
	var pages int64
	for _, n := range counts {
		pages += n
	}
	first := time.Now().UTC().Add(-time.Hour)
	return core.Visit{Day: day, Visitor: visitor, Scene: scene, Platform: platform, Entry: entry, Pages: pages, Counts: counts, FirstAt: first, LastAt: first.Add(time.Duration(seconds) * time.Second)}
}

func TestDashboardTraffic(t *testing.T) {
	r := newReport(7)
	now := time.Now()
	today, yesterday, old := dayKey(now), dayKey(now.AddDate(0, 0, -1)), dayKey(now.AddDate(0, 0, -30))
	rec := func(ns, id, owner string, at time.Time, data any) {
		r.record(ns, core.Record{ID: id, Owner: owner, CreatedAt: at, Data: core.Data(data)})
	}
	rec("visits", "v1", "", now, visitRow(today, "a", "pages/templates/index", 1001, "ios", 120, map[string]int64{"pages/templates/index": 2, "pages/create/index": 1}))
	rec("visits", "v2", "", now, visitRow(today, "b", "pages/create/index", 1007, "android", 0, map[string]int64{"pages/create/index": 1}))
	rec("visits", "v3", "", now, visitRow(yesterday, "a", "pages/templates/index", 1001, "ios", 60, map[string]int64{"pages/templates/index": 1, "pages/mine/index": 1}))
	rec("visits", "v4", "", now, visitRow(old, "c", "pages/mine/index", 1001, "ios", 60, map[string]int64{"pages/mine/index": 5}))
	rec("visitors", "a", "", now, core.Visitor{FirstDay: yesterday})
	rec("visitors", "b", "", now, core.Visitor{FirstDay: today})
	rec("visitors", "c", "", now, core.Visitor{FirstDay: old})
	// u1 returns the next day, u2 does not; pairs ending today are unfinished.
	d3, d2, d1 := now.AddDate(0, 0, -3), now.AddDate(0, 0, -2), now.AddDate(0, 0, -1)
	rec("daily_activity", "1", "u1", d3, nil)
	rec("daily_activity", "2", "u2", d3, nil)
	rec("daily_activity", "3", "u1", d2, nil)
	rec("daily_activity", "4", "u3", d1, nil)
	rec("daily_activity", "5", "u3", now, nil)
	out := r.result()
	tr := out.Breakdown.Traffic
	if tr.PV != 6 || tr.UV != 2 || tr.Visits != 3 || tr.NewVisitors != 2 {
		t.Fatal("totals", tr)
	}
	if tr.PagesPerVisit != 2 || tr.AvgVisitSeconds != 60 || math.Abs(tr.BounceRate-1.0/3) > 1e-9 {
		t.Fatal("ratios", tr)
	}
	if tr.RetentionBase != 3 || math.Abs(tr.NextDayRetention-1.0/3) > 1e-9 {
		t.Fatal("retention", tr.RetentionBase, tr.NextDayRetention)
	}
	if len(tr.TopPages) != 3 || tr.TopPages[0] != (core.PageStat{Page: "pages/templates/index", PV: 3, UV: 1}) || tr.TopPages[1] != (core.PageStat{Page: "pages/create/index", PV: 2, UV: 2}) {
		t.Fatal("pages", tr.TopPages)
	}
	if tr.EntryPages[0] != (core.EntryStat{Page: "pages/templates/index", Visits: 2}) || tr.Scenes[0] != (core.SceneStat{Scene: 1001, Visits: 2}) || len(tr.Platforms) != 2 {
		t.Fatal("breakdowns", tr.EntryPages, tr.Scenes, tr.Platforms)
	}
	last, prev := out.Days[len(out.Days)-1], out.Days[len(out.Days)-2]
	if last.PV != 4 || last.UV != 2 || prev.PV != 2 || prev.UV != 1 {
		t.Fatal("daily", last, prev)
	}
}

func TestDashboardTrafficEmpty(t *testing.T) {
	tr := newReport(7).result().Breakdown.Traffic
	if tr.Visits != 0 || tr.TopPages == nil || tr.Scenes == nil || tr.NextDayRetention != 0 {
		t.Fatal("empty traffic must have zero rates and empty lists", tr)
	}
}

// The MySQL query must select visits and visitors created in the period.
func TestMySQLDashboardTraffic(t *testing.T) {
	m := mysqlFixture(t)
	ctx, id, today := context.Background(), core.NewID(), dayKey(time.Now())
	put := func(ns, rid string, data any) {
		if _, err := m.Put(ctx, ns, core.Record{ID: rid, Data: core.Data(data)}, 0); err != nil {
			t.Fatal(err)
		}
	}
	put("visits", "dash-v-"+id, visitRow(today, "dash-a-"+id, "pages/works/index", 1089, "ios", 30, map[string]int64{"pages/works/index": 2}))
	put("visitors", "dash-a-"+id, core.Visitor{FirstDay: today})
	out, err := m.Dashboard(ctx, 7)
	if err != nil {
		t.Fatal(err)
	}
	tr := out.Breakdown.Traffic
	if tr.Visits < 1 || tr.PV < 2 || tr.NewVisitors < 1 || out.Days[len(out.Days)-1].UV < 1 {
		t.Fatal("mysql traffic", tr)
	}
}

func TestDashboardTrafficPerClient(t *testing.T) {
	r := newReport(7)
	now := time.Now()
	today := dayKey(now)
	add := func(id, client, source, visitor string, pages int64) {
		v := visitRow(today, visitor, "e", 1001, "ios", 30, map[string]int64{"p": pages})
		v.Client, v.Source = client, source
		r.record("visits", core.Record{ID: id, CreatedAt: now, Data: core.Data(v)})
		r.record("visitors", core.Record{ID: visitor + id, CreatedAt: now, Data: core.Data(core.Visitor{FirstDay: today, Client: client})})
	}
	add("1", "", "", "m1", 3) // record from before the client field
	add("2", "web", "weibo.com", "w1", 1)
	add("3", "web", "wechat", "w2", 2)
	add("4", "app", "appstore", "a1", 4)
	out := r.result().Breakdown
	all, mini, web, app := out.Traffic, out.TrafficByClient["miniprogram"], out.TrafficByClient["web"], out.TrafficByClient["app"]
	if all.PV != 10 || all.Visits != 4 || mini.PV != 3 || web.PV != 3 || web.UV != 2 || app.PV != 4 || app.NewVisitors != 1 {
		t.Fatalf("split all=%+v mini=%+v web=%+v app=%+v", all, mini, web, app)
	}
	if len(all.Clients) != 3 || all.Clients[0].Client != "app" || len(web.Scenes) != 0 || len(web.Sources) != 2 || len(mini.Scenes) != 1 {
		t.Fatalf("shares %+v web sources %+v scenes %+v", all.Clients, web.Sources, web.Scenes)
	}
	var dayPV int64
	for _, d := range r.days {
		dayPV += d.PV
	}
	if dayPV != 10 {
		t.Fatal("client builders must not double the daily series", dayPV)
	}
}
