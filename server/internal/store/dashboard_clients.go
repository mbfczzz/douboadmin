package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"slices"
)

// trafficSet runs one builder over all visits and one per client, so the
// overview can switch between 全部 / 小程序 / 网页 / APP. Only the all-clients
// builder writes the daily PV/UV series and next-day retention.
type trafficSet struct {
	all   *trafficBuilder
	by    map[string]*trafficBuilder
	days  map[string]*core.DailyMetric
	today string
}

func newTrafficSet(days map[string]*core.DailyMetric, today string) *trafficSet {
	return &trafficSet{all: newTraffic(days, today), by: map[string]*trafficBuilder{}, days: days, today: today}
}

// client builders get their own copy of the period's days so they never
// touch the dashboard series.
func (s *trafficSet) client(c string) *trafficBuilder {
	if b := s.by[c]; b != nil {
		return b
	}
	days := map[string]*core.DailyMetric{}
	for k, d := range s.days {
		days[k] = &core.DailyMetric{Date: d.Date}
	}
	b := newTraffic(days, s.today)
	s.by[c] = b
	return b
}

func (s *trafficSet) record(ns string, row core.Record) {
	s.all.record(ns, row)
	var v struct {
		Client string `json:"client"`
	}
	switch ns {
	case "visits", "visitors":
		_ = json.Unmarshal(row.Data, &v)
		s.client(core.VisitClient(v.Client)).record(ns, row)
	}
}

func (s *trafficSet) result() (core.Traffic, map[string]core.Traffic) {
	all, by := s.all.result(), map[string]core.Traffic{}
	all.Clients = []core.ClientStat{}
	for c, b := range s.by {
		t := b.result()
		by[c] = t
		if t.Visits > 0 {
			all.Clients = append(all.Clients, core.ClientStat{Client: c, PV: t.PV, UV: t.UV, Visits: t.Visits})
		}
	}
	slices.SortFunc(all.Clients, func(a, b core.ClientStat) int { return int(b.PV - a.PV) })
	return all, by
}
