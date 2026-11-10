package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

func jobWhere(q core.JobQuery, referenceID string) (string, []any) {
	w, args := " FROM jobs j LEFT JOIN work_meta w ON w.id="+referenceID+" WHERE 1=1", []any{}
	add := func(clause string, value any) { w += clause; args = append(args, value) }
	if q.User != "" {
		add(" AND j.user_id=?", q.User)
	}
	if q.Status != "" {
		add(" AND j.status=?", q.Status)
	}
	if q.Kind == "video" {
		w += " AND j.input->>'$.kind' IN ('video','mix')"
	} else if q.Kind != "" {
		add(" AND j.input->>'$.kind'=?", q.Kind)
	}
	if q.Works {
		w += " AND j.status='succeeded' AND j.input->>'$.kind' IN ('image','video','mix')"
	}
	if q.ExcludeChat {
		w += " AND j.input->>'$.kind'<>'chat'"
	}
	if q.ExcludeImport {
		w += " AND j.input->>'$.kind'<>'import'"
	}
	if q.Ended {
		w += " AND j.status IN ('succeeded','failed')"
	}
	if q.Deleted == "active" {
		w += " AND COALESCE(w.deleted,0)=0"
	}
	if q.Deleted == "deleted" {
		w += " AND w.deleted=1"
	}
	if q.Search != "" {
		add(" AND LOCATE(?,CONCAT_WS(' ',j.id,j.user_id,j.input->>'$.prompt'))>0", q.Search)
	}
	return w, args
}

func (m *MySQL) JobPage(ctx context.Context, q core.JobQuery) (out core.JobPage, err error) {
	out = core.JobPage{Items: []core.Job{}, Page: q.Page, Size: q.Size}
	if !q.Valid() {
		return out, fmt.Errorf("invalid job page")
	}
	referenceID, err := m.jobReferenceID(ctx, "work_meta")
	if err != nil {
		return out, err
	}
	tx, err := m.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	w, args := jobWhere(q, referenceID)
	if err = tx.QueryRowContext(ctx, "SELECT COUNT(*)"+w, args...).Scan(&out.Total); err != nil {
		return out, err
	}
	cols := "j." + strings.ReplaceAll(jobCols, ",", ",j.")
	rows, err := tx.QueryContext(ctx, "SELECT "+cols+w+" ORDER BY j.created_at DESC,j.id DESC LIMIT ? OFFSET ?", append(args, q.Size, (q.Page-1)*q.Size)...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		j, e := scanJob(rows)
		if e != nil {
			return out, e
		}
		out.Items = append(out.Items, j)
	}
	if err = rows.Err(); err != nil {
		return out, err
	}
	return out, tx.Commit()
}

func jobMatches(j core.Job, q core.JobQuery, deleted bool) bool {
	if q.User != "" && j.UserID != q.User || q.Status != "" && j.Status != q.Status {
		return false
	}
	if q.Kind != "" && j.Input.Kind != q.Kind && !(q.Kind == "video" && j.Input.Kind == "mix") {
		return false
	}
	if q.Works && (j.Status != "succeeded" || !core.IsWork(j.Input.Kind)) {
		return false
	}
	if q.ExcludeChat && j.Input.Kind == "chat" || q.ExcludeImport && j.Input.Kind == "import" {
		return false
	}
	if q.Ended && j.Status != "succeeded" && j.Status != "failed" {
		return false
	}
	if q.Deleted == "active" && deleted || q.Deleted == "deleted" && !deleted {
		return false
	}
	return q.Search == "" || strings.Contains(strings.ToLower(j.ID+" "+j.UserID+" "+j.Input.Prompt), strings.ToLower(q.Search))
}

func (m *Memory) JobPage(_ context.Context, q core.JobQuery) (out core.JobPage, err error) {
	out = core.JobPage{Items: []core.Job{}, Page: q.Page, Size: q.Size}
	if !q.Valid() {
		return out, fmt.Errorf("invalid job page")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	all := []core.Job{}
	for _, j := range m.jobs {
		var meta core.WorkMeta
		_ = json.Unmarshal(m.records["work_meta:"+j.ID].Data, &meta)
		if jobMatches(j, q, meta.Deleted) {
			all = append(all, copyJob(j))
		}
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].CreatedAt.Equal(all[j].CreatedAt) {
			return all[i].ID > all[j].ID
		}
		return all[i].CreatedAt.After(all[j].CreatedAt)
	})
	out.Total = len(all)
	start := (q.Page - 1) * q.Size
	if start < len(all) {
		out.Items = all[start:min(start+q.Size, len(all))]
	}
	return out, nil
}
