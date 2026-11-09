package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"time"
)

// compareBuilder totals the period just before the report, of the same
// length and aligned to "now" (today vs yesterday up to this time), so the
// overview can show 较上期 without comparing a partial day to a full one.
type compareBuilder struct {
	from, to time.Time
	out      core.PeriodTotals
	active   map[string]bool
	visitors map[string]bool
}

func newCompare(since time.Time, days int) *compareBuilder {
	return &compareBuilder{from: since.AddDate(0, 0, -days), to: time.Now().AddDate(0, 0, -days),
		active: map[string]bool{}, visitors: map[string]bool{}}
}

func (c *compareBuilder) in(t *time.Time) bool {
	return t != nil && !t.Before(c.from) && t.Before(c.to)
}

func (c *compareBuilder) record(ns string, row core.Record) {
	switch ns {
	case "users":
		if c.in(&row.CreatedAt) {
			c.out.NewUsers++
		}
	case "daily_activity":
		if c.in(&row.CreatedAt) {
			c.active[row.Owner] = true
		}
	case "orders":
		var o core.Order
		if json.Unmarshal(row.Data, &o) == nil && c.in(o.PaidAt) {
			c.out.PaidFen += o.AmountFen
		}
	case "refunds":
		var f core.Refund
		if json.Unmarshal(row.Data, &f) == nil && f.Status == "succeeded" && c.in(f.CompletedAt) {
			c.out.RefundFen += f.AmountFen
		}
	case "visits":
		var v core.Visit
		if json.Unmarshal(row.Data, &v) == nil && c.in(&v.FirstAt) {
			c.out.PV += v.Pages
			c.visitors[v.Visitor] = true
		}
	}
}

func (c *compareBuilder) job(j core.Job) {
	if j.Input.Kind == "import" || !c.in(&j.CreatedAt) {
		return
	}
	c.out.Jobs++
	if j.Status == "succeeded" {
		c.out.Succeeded++
	}
}

func (c *compareBuilder) result() *core.PeriodTotals {
	out := c.out
	out.ActiveUsers, out.UV = int64(len(c.active)), int64(len(c.visitors))
	out.RevenueFen = out.PaidFen - out.RefundFen
	return &out
}
