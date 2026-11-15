package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"
)

func (t *memoryTransaction) ExpireJob(j core.Job, now time.Time) error {
	stored, ok := t.jobs[j.ID]
	if !ok || (stored.Status != "queued" && stored.Status != "running") || !core.JobExpired(stored, now) {
		return core.ErrConflict
	}
	stored.Status, stored.Progress, stored.Result, stored.Error = "failed", 100, "", (&core.JobTimeout{Kind: stored.Input.Kind}).Error()
	stored.LeaseToken, stored.LeaseUntil, stored.UpdatedAt = "", time.Time{}, time.Now().UTC()
	t.jobs[j.ID] = stored
	return nil
}

func (t *mysqlTransaction) ExpireJob(j core.Job, now time.Time) error {
	if !core.JobExpired(j, now) {
		return core.ErrConflict
	}
	return affected(t.tx.ExecContext(t.ctx, `UPDATE jobs SET status='failed',progress=100,result='',error=?,lease_token='',lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND created_at=? AND status IN ('queued','running')`, (&core.JobTimeout{Kind: j.Input.Kind}).Error(), j.ID, j.CreatedAt))
}

func expireFundedJob(ctx context.Context, s Store, id string, now time.Time) error {
	return s.Atomic(ctx, func(tx Transaction) error {
		j, err := tx.Job(id)
		if err != nil {
			return err
		}
		if _, _, err = LockWallet(tx, j.UserID); err != nil {
			return err
		}
		j, err = tx.Job(id)
		if err != nil {
			return err
		}
		if !core.JobExpired(j, now) {
			return core.ErrConflict
		}
		if err = tx.ExpireJob(j, now); err != nil {
			return err
		}
		failure := (&core.JobTimeout{Kind: j.Input.Kind}).Error()
		row, err := tx.Get("executions", id)
		if err == nil {
			row, err = tx.Lock("executions", core.Record{ID: id})
			if err != nil {
				return err
			}
			var data map[string]json.RawMessage
			if json.Unmarshal(row.Data, &data) != nil || data == nil {
				data = map[string]json.RawMessage{}
			}
			var phase string
			_ = json.Unmarshal(data["phase"], &phase)
			// Preserve the existing verified-failure policy for submitted upstream work.
			j.HoldOnFailure = phase != "failed"
			data["phase"], data["error"], data["note"] = core.Data("timed_out"), core.Data(failure), core.Data(failure)
			delete(data, "errorCause")
			row.Data = core.Data(data)
			if _, err = tx.Put("executions", row, row.Version); err != nil {
				return err
			}
		} else if !errors.Is(err, core.ErrNotFound) {
			return err
		}
		return completeJobAccounting(tx, j, failure)
	})
}

func expireCandidates(ctx context.Context, s Store, jobs []core.Job, now time.Time) (int, error) {
	count := 0
	for _, j := range jobs {
		err := expireFundedJob(ctx, s, j.ID, now)
		if errors.Is(err, core.ErrConflict) || errors.Is(err, core.ErrNotFound) {
			continue
		}
		if err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

func (m *Memory) ExpireJobs(ctx context.Context, now time.Time, limit int) (int, error) {
	if limit < 1 || limit > 1000 {
		return 0, fmt.Errorf("invalid expiration batch size")
	}
	m.mu.Lock()
	jobs := []core.Job{}
	for _, j := range m.jobs {
		if (j.Status == "queued" || j.Status == "running") && core.JobExpired(j, now) {
			jobs = append(jobs, copyJob(j))
		}
	}
	m.mu.Unlock()
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].CreatedAt.Before(jobs[j].CreatedAt) })
	return expireCandidates(ctx, m, jobs[:min(limit, len(jobs))], now)
}

func (m *MySQL) ExpireJobs(ctx context.Context, now time.Time, limit int) (int, error) {
	if limit < 1 || limit > 1000 {
		return 0, fmt.Errorf("invalid expiration batch size")
	}
	rows, err := m.db.QueryContext(ctx, `SELECT `+jobCols+` FROM jobs WHERE status IN ('queued','running') AND ((input->>'$.kind'='image' AND created_at<=?) OR (input->>'$.kind' IN ('video','mix') AND created_at<=?)) ORDER BY created_at,id LIMIT ?`, now.Add(-10*time.Minute), now.Add(-time.Hour), limit)
	if err != nil {
		return 0, err
	}
	jobs := []core.Job{}
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			rows.Close()
			return 0, err
		}
		jobs = append(jobs, j)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return 0, err
	}
	return expireCandidates(ctx, m, jobs, now)
}
