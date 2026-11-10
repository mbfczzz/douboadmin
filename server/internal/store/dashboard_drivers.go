package store

import (
	"context"
	"doubo/server/internal/core"
	"strings"
)

func (m *Memory) Dashboard(_ context.Context, days int) (core.Dashboard, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	report := newReport(days)
	for key, row := range m.records {
		ns, _, _ := strings.Cut(key, ":")
		report.record(ns, row)
	}
	for _, j := range m.jobs {
		report.job(j)
	}
	return report.result(), nil
}
func (m *MySQL) Dashboard(ctx context.Context, days int) (core.Dashboard, error) {
	r := newReport(days)
	// This period and the one before it (for 较上期), plus the small partners
	// table for provider names. Builders ignore rows outside their window.
	from := r.prev.from
	scans := []struct{ ns, where string }{
		{"users", "created_at>=?"}, {"daily_activity", "created_at>=?"}, {"analytics", "created_at>=?"},
		{"executions", "created_at>=?"}, {"job_billing", "created_at>=?"}, {"visits", "created_at>=?"},
		{"visitors", "created_at>=?"}, {"partners", "1=1"},
		{"orders", "created_at>=? OR paid_at>=?"}, {"refunds", "completed_at>=?"},
		{"partner_audit", "created_at>=? AND kind='registration_approved'"},
	}
	for _, scan := range scans {
		t, e := tableOf(scan.ns)
		if e != nil {
			return core.Dashboard{}, e
		}
		args := make([]any, strings.Count(scan.where, "?"))
		for i := range args {
			args[i] = from
		}
		rows, e := listRows(ctx, m.db, "SELECT "+t.selectList()+" FROM `"+t.Name+"` WHERE "+scan.where, t, args...)
		if e != nil {
			return core.Dashboard{}, e
		}
		for _, row := range rows {
			r.record(scan.ns, row)
		}
	}
	jobs, e := m.db.QueryContext(ctx, `SELECT `+jobCols+` FROM jobs WHERE created_at>=?`, from)
	if e != nil {
		return core.Dashboard{}, e
	}
	defer jobs.Close()
	for jobs.Next() {
		j, err := scanJob(jobs)
		if err != nil {
			return core.Dashboard{}, err
		}
		r.job(j)
	}
	if e = jobs.Err(); e != nil {
		return core.Dashboard{}, e
	}
	out := r.result()
	// The scan above only covers this period; total users are all-time.
	if e = m.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&out.Breakdown.TotalUsers); e != nil {
		return core.Dashboard{}, e
	}
	return out, nil
}
