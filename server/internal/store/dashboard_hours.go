package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"time"
)

// hourSeries is the "today" overview's chart: the daily metrics again, one
// bucket per Beijing-time hour, so a single day is not one lone bar.
type hourSeries struct {
	day   string
	hours [24]*core.DailyMetric
	uv    [24]map[string]bool
}

func newHours(day string) *hourSeries {
	h := &hourSeries{day: day}
	for i := range h.hours {
		h.hours[i] = &core.DailyMetric{Date: fmt.Sprintf("%02d:00", i)}
		h.uv[i] = map[string]bool{}
	}
	return h
}

// at returns the hour bucket for a moment of the day, or nil.
func (h *hourSeries) at(t time.Time) *core.DailyMetric {
	if h == nil {
		return nil
	}
	local := t.In(reportZone)
	if local.Format("2006-01-02") != h.day {
		return nil
	}
	return h.hours[local.Hour()]
}

func (h *hourSeries) record(ns string, row core.Record) {
	if h == nil {
		return
	}
	switch ns {
	case "users":
		if b := h.at(row.CreatedAt); b != nil {
			b.NewUsers++
		}
	case "daily_activity": // first activity of the day
		if b := h.at(row.CreatedAt); b != nil {
			b.ActiveUsers++
		}
	case "orders":
		var o core.Order
		if json.Unmarshal(row.Data, &o) == nil && o.PaidAt != nil {
			if b := h.at(*o.PaidAt); b != nil {
				b.PaidFen += o.AmountFen
				b.PaidOrders++
			}
		}
	case "refunds":
		var f core.Refund
		if json.Unmarshal(row.Data, &f) == nil && f.Status == "succeeded" && f.CompletedAt != nil {
			if b := h.at(*f.CompletedAt); b != nil {
				b.RefundFen += f.AmountFen
			}
		}
	case "visits": // by the hour the visit started
		var v core.Visit
		if json.Unmarshal(row.Data, &v) == nil {
			if b := h.at(v.FirstAt); b != nil {
				b.PV += v.Pages
				h.uv[v.FirstAt.In(reportZone).Hour()][v.Visitor] = true
			}
		}
	}
}

func (h *hourSeries) job(j core.Job, charged int64) {
	b := h.at(j.CreatedAt)
	if b == nil || j.Input.Kind == "import" {
		return
	}
	b.Jobs++
	switch j.Status {
	case "succeeded":
		b.Succeeded++
		b.SpentUnits += charged
	case "failed":
		b.Failed++
	}
}

func (h *hourSeries) result() []core.DailyMetric {
	if h == nil {
		return nil
	}
	out := make([]core.DailyMetric, 0, 24)
	for i, b := range h.hours {
		b.UV = int64(len(h.uv[i]))
		b.RevenueFen = b.PaidFen - b.RefundFen
		out = append(out, *b)
	}
	return out
}
