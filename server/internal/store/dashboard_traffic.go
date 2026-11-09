package store

import (
	"cmp"
	"doubo/server/internal/core"
	"encoding/json"
	"slices"
	"time"
)

// trafficBuilder aggregates anonymous visits ("visits", "visitors") and the
// next-day retention of signed-in users ("daily_activity").
type trafficBuilder struct {
	days      map[string]*core.DailyMetric
	today     string
	out       core.Traffic
	visitors  map[string]bool
	dayUV     map[string]map[string]bool
	pagePV    map[string]int64
	pageUV    map[string]map[string]bool
	entries   map[string]int64
	scenes    map[int]int64
	sources   map[string]int64
	platforms map[string]int64
	active    map[string]map[string]bool
	seconds   int64
	bounces   int64
}

func newTraffic(days map[string]*core.DailyMetric, today string) *trafficBuilder {
	return &trafficBuilder{days: days, today: today, visitors: map[string]bool{}, dayUV: map[string]map[string]bool{}, pagePV: map[string]int64{}, pageUV: map[string]map[string]bool{}, entries: map[string]int64{}, scenes: map[int]int64{}, sources: map[string]int64{}, platforms: map[string]int64{}, active: map[string]map[string]bool{}}
}

func addTo[K comparable](m map[string]map[K]bool, key string, v K) {
	if m[key] == nil {
		m[key] = map[K]bool{}
	}
	m[key][v] = true
}

func (t *trafficBuilder) record(ns string, row core.Record) {
	switch ns {
	case "visits":
		var v core.Visit
		if json.Unmarshal(row.Data, &v) != nil || t.days[v.Day] == nil {
			return
		}
		t.days[v.Day].PV += v.Pages
		addTo(t.dayUV, v.Day, v.Visitor)
		t.visitors[v.Visitor] = true
		t.out.Visits++
		t.out.PV += v.Pages
		if v.Pages <= 1 {
			t.bounces++
		}
		if d := v.LastAt.Sub(v.FirstAt); d > 0 {
			t.seconds += int64(d / time.Second)
		}
		t.entries[v.Entry]++
		// Scene codes only mean something inside WeChat; web and app send a
		// source (referrer or channel) instead.
		if core.VisitClient(v.Client) == core.ClientMiniProgram {
			t.scenes[v.Scene]++
		}
		if v.Source != "" {
			t.sources[v.Source]++
		}
		t.platforms[v.Platform]++
		for page, n := range v.Counts {
			t.pagePV[page] += n
			addTo(t.pageUV, page, v.Visitor)
		}
	case "visitors":
		var v core.Visitor
		if json.Unmarshal(row.Data, &v) == nil && t.days[v.FirstDay] != nil {
			t.out.NewVisitors++
		}
	case "daily_activity":
		day := row.CreatedAt.In(reportZone).Format("2006-01-02")
		if t.days[day] != nil {
			addTo(t.active, day, row.Owner)
		}
	}
}

// top sorts by count (desc, then key) and keeps the first n entries.
func top[K cmp.Ordered, T any](m map[K]int64, n int, build func(K, int64) T) []T {
	keys := make([]K, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.SortFunc(keys, func(a, b K) int {
		if c := cmp.Compare(m[b], m[a]); c != 0 {
			return c
		}
		return cmp.Compare(a, b)
	})
	out := []T{}
	for _, k := range keys[:min(n, len(keys))] {
		out = append(out, build(k, m[k]))
	}
	return out
}

func (t *trafficBuilder) result() core.Traffic {
	out := t.out
	out.UV = int64(len(t.visitors))
	for day, d := range t.days {
		d.UV = int64(len(t.dayUV[day]))
	}
	if out.Visits > 0 {
		out.PagesPerVisit = float64(out.PV) / float64(out.Visits)
		out.AvgVisitSeconds = t.seconds / out.Visits
		out.BounceRate = float64(t.bounces) / float64(out.Visits)
	}
	// Day D counts when D+1 is a finished day inside the period.
	var kept int64
	for day, users := range t.active {
		next, _ := time.Parse("2006-01-02", day)
		key := next.AddDate(0, 0, 1).Format("2006-01-02")
		if t.days[key] == nil || key >= t.today {
			continue
		}
		out.RetentionBase += int64(len(users))
		for u := range users {
			if t.active[key][u] {
				kept++
			}
		}
	}
	if out.RetentionBase > 0 {
		out.NextDayRetention = float64(kept) / float64(out.RetentionBase)
	}
	out.TopPages = top(t.pagePV, 8, func(p string, n int64) core.PageStat {
		return core.PageStat{Page: p, PV: n, UV: int64(len(t.pageUV[p]))}
	})
	out.EntryPages = top(t.entries, 5, func(p string, n int64) core.EntryStat { return core.EntryStat{Page: p, Visits: n} })
	out.Scenes = top(t.scenes, 6, func(s int, n int64) core.SceneStat { return core.SceneStat{Scene: s, Visits: n} })
	out.Sources = top(t.sources, 6, func(s string, n int64) core.SourceStat { return core.SourceStat{Source: s, Visits: n} })
	out.Platforms = top(t.platforms, 8, func(p string, n int64) core.PlatformStat { return core.PlatformStat{Platform: p, Visits: n} })
	return out
}
