package store

import (
	"context"
	"doubo/server/internal/core"
	"strings"
)

func dashboardIDs(ids []string) (string, []any) {
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	return strings.TrimSuffix(strings.Repeat("?,", len(ids)), ","), args
}

// Recent settlement records can belong to older jobs. Load only their missing
// bills, in bounded batches, rather than scanning all historical billing.
func dashboardPointBills(ctx context.Context, tx querier, r *reportBuilder) error {
	ids := []string{}
	for _, id := range r.points.references() {
		if _, ok := r.points.bills[id]; !ok {
			ids = append(ids, id)
		}
	}
	t, err := tableOf("job_billing")
	if err != nil {
		return err
	}
	for start := 0; start < len(ids); start += 200 {
		marks, args := dashboardIDs(ids[start:min(start+200, len(ids))])
		rows, err := listRows(ctx, tx, "SELECT "+t.selectList()+" FROM job_billing WHERE id IN ("+marks+")", t, args...)
		if err != nil {
			return err
		}
		for _, row := range rows {
			r.record("job_billing", row)
		}
	}
	return nil
}

// The normal dashboard scan already visits every job created in the two
// report periods. Only add older jobs referenced by holds or settlements.
func dashboardPointJobs(ctx context.Context, tx querier, r *reportBuilder) error {
	ids := []string{}
	for _, id := range r.points.references() {
		if !r.points.seen[id] {
			ids = append(ids, id)
		}
	}
	for start := 0; start < len(ids); start += 200 {
		marks, args := dashboardIDs(ids[start:min(start+200, len(ids))])
		rows, err := tx.QueryContext(ctx, "SELECT "+jobCols+" FROM jobs WHERE created_at<? AND id IN ("+marks+")", append([]any{r.prev.from}, args...)...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var j core.Job
			if j, err = scanJob(rows); err != nil {
				break
			}
			r.job(j)
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err != nil {
			return err
		}
	}
	return nil
}
