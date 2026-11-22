package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"sort"
	"strings"
	"time"
)

type pointBill struct {
	core.JobBilling
	owner string
}
type pointSettlement struct {
	core.LedgerEntry
	at time.Time
}
type pointReport struct {
	bills    map[string]pointBill
	entries  map[string]pointSettlement
	seen     map[string]bool
	from, to time.Time
	out      core.PointStats
}

func newPointReport(from, to time.Time) *pointReport {
	return &pointReport{bills: map[string]pointBill{}, entries: map[string]pointSettlement{}, seen: map[string]bool{}, from: from, to: to}
}

func (p *pointReport) record(ns string, row core.Record) {
	switch ns {
	case "job_billing":
		var bill core.JobBilling
		if json.Unmarshal(row.Data, &bill) == nil && bill.Units >= 0 && bill.Units <= core.MaxBalance {
			p.bills[row.ID] = pointBill{JobBilling: bill, owner: row.Owner}
		}
	case "wallet_ledger":
		var entry core.LedgerEntry
		if row.CreatedAt.Before(p.from) || row.CreatedAt.After(p.to) || json.Unmarshal(row.Data, &entry) != nil {
			return
		}
		parts := strings.Split(entry.Reference, ":")
		if len(parts) != 3 || parts[0] != "job" || parts[1] == "" || entry.UserID != row.Owner {
			return
		}
		if parts[2] != "settle" && !(parts[2] == "manual-release" && entry.Kind == "job_release") {
			return
		}
		if entry.Kind != "job_charge" && entry.Kind != "job_usage" && entry.Kind != "job_release" {
			return
		}
		if entry.AvailableDelta < -core.MaxBalance || entry.AvailableDelta > core.MaxBalance || entry.HeldDelta < -core.MaxBalance || entry.HeldDelta > core.MaxBalance {
			return
		}
		if old, ok := p.entries[parts[1]]; !ok || row.CreatedAt.After(old.at) {
			p.entries[parts[1]] = pointSettlement{LedgerEntry: entry, at: row.CreatedAt}
		}
	}
}

// References include long-running holds and jobs submitted before the report
// period that settled in it. No arbitrary recent-job limit may hide them.
func (p *pointReport) references() []string {
	ids := map[string]bool{}
	for id, bill := range p.bills {
		if bill.State == "reserved" {
			ids[id] = true
		}
	}
	for id := range p.entries {
		ids[id] = true
	}
	out := make([]string, 0, len(ids))
	for id := range ids {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func (r *reportBuilder) jobPoints(j core.Job) {
	p := r.points
	p.seen[j.ID] = true
	bill, ok := p.bills[j.ID]
	if !ok || bill.owner != j.UserID || j.Input.Kind == "import" {
		return
	}
	if bill.State == "reserved" && bill.Units > 0 {
		p.out.ReservedUnits += bill.Units
		p.out.ReservedJobs++
		return
	}
	e, ok := p.entries[j.ID]
	if !ok || e.UserID != j.UserID {
		return
	}
	if e.Kind == "job_release" {
		if j.Status == "failed" && bill.State == "released" && e.AvailableDelta > 0 && e.AvailableDelta == bill.Units && e.HeldDelta == -bill.Units && r.days[e.at.In(reportZone).Format("2006-01-02")] != nil {
			p.out.ReleasedUnits += e.AvailableDelta
			p.out.ReleasedJobs++
		}
		return
	}
	if j.Status != "succeeded" || bill.State != "charged" {
		return
	}
	// Token billing returns the unused reservation in AvailableDelta. Its
	// net debit, not the original hold or quoted price, is the actual charge.
	units := -e.HeldDelta - e.AvailableDelta
	if units < 0 || units > core.MaxBalance || units != bill.Units {
		return
	}
	if r.prev.in(&e.at) {
		r.prev.out.SpentUnits += units
	}
	day := r.days[e.at.In(reportZone).Format("2006-01-02")]
	if day == nil {
		return
	}
	day.SpentUnits += units
	if hour := r.hours.at(e.at); hour != nil {
		hour.SpentUnits += units
	}
	p.out.SpentUnits += units
	p.out.ChargedJobs++
	switch j.Input.Kind {
	case "image":
		p.out.ImageUnits += units
	case "video", "mix":
		p.out.VideoUnits += units
	default:
		p.out.OtherUnits += units
	}
}
