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
	rows, e := m.db.QueryContext(ctx, `SELECT namespace,id,owner_id,version,data,created_at FROM records WHERE (namespace IN ('users','daily_activity','analytics','executions') AND created_at>=?) OR (namespace='orders' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.paidAt'))>=?) OR (namespace='refunds' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.completedAt'))>=?)`, r.since, r.since.Format("2006-01-02"), r.since.Format("2006-01-02"))
	if e != nil {
		return core.Dashboard{}, e
	}
	for rows.Next() {
		var ns string
		var record core.Record
		if e = rows.Scan(&ns, &record.ID, &record.Owner, &record.Version, &record.Data, &record.CreatedAt); e != nil {
			rows.Close()
			return core.Dashboard{}, e
		}
		r.record(ns, record)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return core.Dashboard{}, e
	}
	jobs, e := m.db.QueryContext(ctx, `SELECT `+jobCols+` FROM jobs WHERE created_at>=?`, r.since)
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
	return r.result(), nil
}
