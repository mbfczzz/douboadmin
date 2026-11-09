package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"sort"
	"time"
)

var reportZone = time.FixedZone("Asia/Shanghai", 8*60*60)

type reportBuilder struct {
	days   map[string]*core.DailyMetric
	models map[string]*core.ModelCost
	events map[string]int64
	extra  *breakdownBuilder
	period int
	since  time.Time
}

func newReport(days int) *reportBuilder {
	if days < 1 || days > 90 {
		days = 30
	}
	now := time.Now().In(reportZone)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, reportZone).AddDate(0, 0, 1-days)
	r := &reportBuilder{days: map[string]*core.DailyMetric{}, models: map[string]*core.ModelCost{}, events: map[string]int64{}, extra: newBreakdown(start.UTC()), period: days, since: start.UTC()}
	for i := 0; i < days; i++ {
		key := start.AddDate(0, 0, i).Format("2006-01-02")
		r.days[key] = &core.DailyMetric{Date: key}
	}
	return r
}
func (r *reportBuilder) record(ns string, row core.Record) {
	r.extra.record(ns, row)
	day := r.days[row.CreatedAt.In(reportZone).Format("2006-01-02")]
	switch ns {
	case "users":
		if day != nil {
			day.NewUsers++
		}
	case "daily_activity":
		if day != nil {
			day.ActiveUsers++
		}
	case "analytics":
		if day != nil {
			var e struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(row.Data, &e) == nil {
				r.events[e.Name]++
			}
		}
	case "orders":
		var o core.Order
		if json.Unmarshal(row.Data, &o) == nil && o.PaidAt != nil {
			if d := r.days[o.PaidAt.In(reportZone).Format("2006-01-02")]; d != nil {
				d.PaidFen += o.AmountFen
				d.PaidOrders++
			}
		}
	case "refunds":
		var f core.Refund
		if json.Unmarshal(row.Data, &f) == nil && f.Status == "succeeded" && f.CompletedAt != nil {
			if d := r.days[f.CompletedAt.In(reportZone).Format("2006-01-02")]; d != nil {
				d.RefundFen += f.AmountFen
			}
		}
	case "executions":
		if day != nil {
			var e struct {
				Model string `json:"modelKey"`
				Cost  *int64 `json:"estimatedCostMicros"`
			}
			if json.Unmarshal(row.Data, &e) == nil && e.Model != "" && e.Model != "local-mix" {
				if r.models[e.Model] == nil {
					r.models[e.Model] = &core.ModelCost{Model: e.Model}
				}
				m := r.models[e.Model]
				m.Calls++
				if e.Cost != nil {
					m.Known++
					m.EstimatedMicros += *e.Cost
				}
			}
		}
	}
}
func (r *reportBuilder) job(j core.Job) {
	d := r.days[j.CreatedAt.In(reportZone).Format("2006-01-02")]
	r.extra.job(j, d)
	if d != nil && j.Input.Kind != "import" {
		d.Jobs++
		if j.Status == "succeeded" {
			d.Succeeded++
		}
		if j.Status == "failed" {
			d.Failed++
		}
	}
}
func (r *reportBuilder) result() core.Dashboard {
	out := core.Dashboard{Days: []core.DailyMetric{}, Models: []core.ModelCost{}, Events: r.events, Period: r.period, Breakdown: r.extra.result()}
	for _, d := range r.days {
		d.RevenueFen = d.PaidFen - d.RefundFen
		out.Days = append(out.Days, *d)
	}
	sort.Slice(out.Days, func(i, j int) bool { return out.Days[i].Date < out.Days[j].Date })
	for _, m := range r.models {
		out.Models = append(out.Models, *m)
	}
	sort.Slice(out.Models, func(i, j int) bool { return out.Models[i].Calls > out.Models[j].Calls })
	return out
}
