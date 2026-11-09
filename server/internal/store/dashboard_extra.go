package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"sort"
	"time"
)

// breakdownBuilder collects period totals beyond the daily series.
type breakdownBuilder struct {
	out       core.Breakdown
	active    map[string]bool
	creators  map[string]bool
	payers    map[string]bool
	charged   map[string]int64 // job id → points charged
	providers map[string]int64
	names     map[string]string
	since     time.Time
}

func newBreakdown(since time.Time) *breakdownBuilder {
	return &breakdownBuilder{out: core.Breakdown{Kinds: map[string]*core.KindStat{}, Channels: map[string]*core.ChannelStat{}, Providers: []core.ProviderStat{}}, active: map[string]bool{}, creators: map[string]bool{}, payers: map[string]bool{}, charged: map[string]int64{}, providers: map[string]int64{}, names: map[string]string{}, since: since}
}

func (b *breakdownBuilder) inPeriod(t *time.Time) bool { return t != nil && !t.Before(b.since) }

// record handles one stored row; users and partners are counted all-time.
func (b *breakdownBuilder) record(ns string, row core.Record) {
	created := row.CreatedAt
	switch ns {
	case "users":
		b.out.TotalUsers++
	case "partners":
		var p core.Partner
		if json.Unmarshal(row.Data, &p) == nil {
			b.names[row.ID] = p.Name
		}
	case "daily_activity":
		if b.inPeriod(&created) {
			b.active[row.Owner] = true
		}
	case "job_billing":
		// Points actually charged live here, not on the job row (MySQL jobs
		// have no cost column). Records are read before jobs.
		var bill core.JobBilling
		if json.Unmarshal(row.Data, &bill) == nil && bill.State == "charged" {
			b.charged[row.ID] = bill.Units
		}
	case "orders":
		var o core.Order
		if json.Unmarshal(row.Data, &o) != nil {
			return
		}
		if b.inPeriod(&created) {
			b.out.OrdersCreated++
		}
		if b.inPeriod(o.PaidAt) {
			b.out.OrdersPaid++
			b.out.PointsSold += o.PointsUnits
			b.payers[o.UserID] = true
			c := b.out.Channels[o.Channel]
			if c == nil {
				c = &core.ChannelStat{}
				b.out.Channels[o.Channel] = c
			}
			c.Orders++
			c.AmountFen += o.AmountFen
		}
	case "refunds":
		var f core.Refund
		if json.Unmarshal(row.Data, &f) == nil && f.Status == "succeeded" && b.inPeriod(f.CompletedAt) {
			b.out.Refunds++
		}
	case "direct_access":
		var d core.DirectAccess
		if json.Unmarshal(row.Data, &d) == nil && b.inPeriod(&d.ActivatedAt) {
			b.out.DirectActivations++
		}
	case "memberships":
		var m core.Membership
		if json.Unmarshal(row.Data, &m) == nil && b.inPeriod(&m.ActivatedAt) {
			b.out.ProviderActivations++
			b.providers[m.PartnerID]++
		}
	case "activation_codes":
		var c core.ActivationCode
		if json.Unmarshal(row.Data, &c) != nil {
			return
		}
		if b.inPeriod(&created) {
			b.out.CodesIssued++
		}
		if c.Status == "used" && b.inPeriod(c.UsedAt) {
			b.out.CodesRedeemed++
		}
	}
}

func (b *breakdownBuilder) job(j core.Job, day *core.DailyMetric) {
	if j.Input.Kind == "import" || !b.inPeriod(&j.CreatedAt) {
		return
	}
	k := b.out.Kinds[j.Input.Kind]
	if k == nil {
		k = &core.KindStat{}
		b.out.Kinds[j.Input.Kind] = k
	}
	k.Jobs++
	b.creators[j.UserID] = true
	local := j.CreatedAt.In(reportZone)
	b.out.Hours[local.Hour()]++
	b.out.Weekdays[(int(local.Weekday())+6)%7]++
	switch j.Status {
	case "succeeded":
		k.Succeeded++
		k.SpentUnits += b.charged[j.ID]
		if day != nil {
			day.SpentUnits += b.charged[j.ID]
		}
		if d := j.UpdatedAt.Sub(j.CreatedAt); d > 0 && d < 24*time.Hour {
			k.DurationMs += d.Milliseconds()
			k.Timed++
		}
	case "failed":
		k.Failed++
	}
}

func (b *breakdownBuilder) result() core.Breakdown {
	b.out.ActiveUsers = int64(len(b.active))
	b.out.CreatorUsers = int64(len(b.creators))
	b.out.Payers = int64(len(b.payers))
	for id, n := range b.providers {
		name := b.names[id]
		if id == core.RootPartner {
			name = "总账号"
		}
		if name == "" {
			name = id
		}
		b.out.Providers = append(b.out.Providers, core.ProviderStat{ID: id, Name: name, Activations: n})
	}
	sort.Slice(b.out.Providers, func(i, j int) bool {
		if b.out.Providers[i].Activations != b.out.Providers[j].Activations {
			return b.out.Providers[i].Activations > b.out.Providers[j].Activations
		}
		return b.out.Providers[i].Name < b.out.Providers[j].Name
	})
	if len(b.out.Providers) > 8 {
		b.out.Providers = b.out.Providers[:8]
	}
	return b.out
}
