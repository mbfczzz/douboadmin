package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"errors"
	"strings"
	"time"
)

// Dedicated table: indexed columns for filtering, bodies kept out of list
// queries. Keyset paging on the time-ordered id keeps every page O(limit).
const auditTable = `CREATE TABLE IF NOT EXISTS audit_logs (id CHAR(26) PRIMARY KEY,at DATETIME(3) NOT NULL,category VARCHAR(16) NOT NULL,action VARCHAR(64) NOT NULL DEFAULT '',actor_type VARCHAR(16) NOT NULL DEFAULT '',actor_id VARCHAR(64) NOT NULL DEFAULT '',actor_name VARCHAR(100) NOT NULL DEFAULT '',target_type VARCHAR(32) NOT NULL DEFAULT '',target_id VARCHAR(64) NOT NULL DEFAULT '',target_name VARCHAR(100) NOT NULL DEFAULT '',method VARCHAR(8) NOT NULL DEFAULT '',route VARCHAR(160) NOT NULL DEFAULT '',path VARCHAR(512) NOT NULL DEFAULT '',status SMALLINT NOT NULL DEFAULT 0,duration_ms INT NOT NULL DEFAULT 0,ip VARCHAR(64) NOT NULL DEFAULT '',user_agent VARCHAR(255) NOT NULL DEFAULT '',summary VARCHAR(500) NOT NULL DEFAULT '',request MEDIUMTEXT NULL,response MEDIUMTEXT NULL,error VARCHAR(1000) NOT NULL DEFAULT '',KEY by_category(category,id),KEY by_actor(actor_id,id),KEY by_target(target_id,id),KEY by_time(at)) ENGINE=InnoDB`

const logColumns = `id,at,category,action,actor_type,actor_id,actor_name,target_type,target_id,target_name,method,route,path,status,duration_ms,ip,user_agent,summary,error`

func clip(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

func (m *MySQL) AppendLogs(ctx context.Context, entries []core.AuditEntry) error {
	if len(entries) == 0 {
		return nil
	}
	row := "(" + placeholders(21) + ")"
	q := `INSERT IGNORE INTO audit_logs (` + logColumns + `,request,response) VALUES ` + strings.TrimSuffix(strings.Repeat(row+",", len(entries)), ",")
	args := make([]any, 0, len(entries)*21)
	for _, e := range entries {
		args = append(args, e.ID, e.At.UTC(), e.Category, clip(e.Action, 64), e.ActorType, clip(e.ActorID, 64), clip(e.ActorName, 100), e.TargetType, clip(e.TargetID, 64), clip(e.TargetName, 100), e.Method, clip(e.Route, 160), clip(e.Path, 512), e.Status, e.DurationMs, clip(e.IP, 64), clip(e.UserAgent, 255), clip(e.Summary, 500), clip(e.Error, 1000), e.Request, e.Response)
	}
	_, err := m.db.ExecContext(ctx, q, args...)
	return err
}

func scanLog(s interface{ Scan(...any) error }, extra ...any) (core.AuditEntry, error) {
	var e core.AuditEntry
	err := s.Scan(append([]any{&e.ID, &e.At, &e.Category, &e.Action, &e.ActorType, &e.ActorID, &e.ActorName, &e.TargetType, &e.TargetID, &e.TargetName, &e.Method, &e.Route, &e.Path, &e.Status, &e.DurationMs, &e.IP, &e.UserAgent, &e.Summary, &e.Error}, extra...)...)
	return e, err
}

func logWhere(q core.AuditQuery) (string, []any) {
	var where []string
	var args []any
	add := func(clause string, values ...any) {
		where = append(where, clause)
		args = append(args, values...)
	}
	if len(q.Categories) > 0 {
		add(`category IN (`+placeholders(len(q.Categories))+`)`, anyStrings(q.Categories)...)
	}
	if q.Before != "" {
		add(`id<?`, q.Before)
	}
	if !q.From.IsZero() {
		add(`at>=?`, q.From.UTC())
	}
	if !q.To.IsZero() {
		add(`at<?`, q.To.UTC())
	}
	if q.Method != "" {
		add(`method=?`, q.Method)
	}
	if q.WritesOnly {
		add(`method NOT IN ('GET','')`)
	}
	if q.Failed != nil {
		if *q.Failed {
			add(`(status>=400 OR error<>'')`)
		} else {
			add(`status<400 AND error=''`)
		}
	}
	like := func(v string) string { return "%" + strings.NewReplacer(`%`, `\%`, `_`, `\_`).Replace(v) + "%" }
	if q.Actor != "" {
		add(`(actor_id=? OR actor_name LIKE ?)`, q.Actor, like(q.Actor))
	}
	if q.Target != "" {
		add(`(target_id=? OR target_name LIKE ?)`, q.Target, like(q.Target))
	}
	if q.Search != "" {
		add(`(path LIKE ? OR action LIKE ? OR summary LIKE ?)`, like(q.Search), like(q.Search), like(q.Search))
	}
	if len(where) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(where, " AND "), args
}

func (m *MySQL) Logs(ctx context.Context, q core.AuditQuery) (core.AuditPage, error) {
	limit, out := logLimit(q), core.AuditPage{Items: []core.AuditEntry{}}
	where, args := logWhere(q)
	rows, err := m.db.QueryContext(ctx, `SELECT `+logColumns+` FROM audit_logs`+where+` ORDER BY id DESC LIMIT ?`, append(args, limit+1)...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		e, err := scanLog(rows)
		if err != nil {
			return out, err
		}
		if len(out.Items) == limit {
			out.Next = out.Items[limit-1].ID
			break
		}
		out.Items = append(out.Items, e)
	}
	return out, rows.Err()
}

func (m *MySQL) Log(ctx context.Context, id string) (core.AuditEntry, error) {
	var req, resp sql.NullString
	e, err := scanLog(m.db.QueryRowContext(ctx, `SELECT `+logColumns+`,request,response FROM audit_logs WHERE id=?`, id), &req, &resp)
	if errors.Is(err, sql.ErrNoRows) {
		return e, core.ErrNotFound
	}
	e.Request, e.Response = req.String, resp.String
	return e, err
}

// PruneLogs deletes in small batches so a large backlog never holds long locks.
func (m *MySQL) PruneLogs(ctx context.Context, writes, reads time.Time) (int64, error) {
	var total int64
	for _, step := range []struct {
		q   string
		arg time.Time
	}{{`DELETE FROM audit_logs WHERE at<? LIMIT 5000`, writes}, {`DELETE FROM audit_logs WHERE method='GET' AND at<? LIMIT 5000`, reads}} {
		for {
			res, err := m.db.ExecContext(ctx, step.q, step.arg.UTC())
			if err != nil {
				return total, err
			}
			n, _ := res.RowsAffected()
			total += n
			if n < 5000 {
				break
			}
		}
	}
	return total, nil
}

func (m *MySQL) LogStats(ctx context.Context, since time.Time) (core.APIStats, error) {
	var out core.APIStats
	var avg sql.NullFloat64
	err := m.db.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(status>=500),0),COALESCE(SUM(status BETWEEN 400 AND 499),0),COALESCE(SUM(duration_ms>1000),0),AVG(duration_ms),COUNT(DISTINCT CASE WHEN actor_type='user' THEN actor_id END) FROM audit_logs WHERE at>=? AND category<>'model'`, since.UTC()).Scan(&out.Requests, &out.Errors, &out.Rejected, &out.Slow, &avg, &out.Users)
	out.AvgMs = avg.Float64
	return out, err
}
