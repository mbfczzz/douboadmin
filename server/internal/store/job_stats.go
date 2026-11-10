package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"sort"
)

func (m *MySQL) JobStats(ctx context.Context, user string) (out core.JobStats, err error) {
	referenceID, err := m.jobReferenceID(ctx, "work_meta")
	if err != nil {
		return out, err
	}
	q := `SELECT COALESCE(SUM(j.status='succeeded' AND COALESCE(w.deleted,0)=0),0), COALESCE(SUM(j.status IN ('queued','running')),0), COALESCE(SUM(j.status='failed'),0) FROM jobs j LEFT JOIN work_meta w ON w.id=` + referenceID + ` WHERE j.user_id=? AND j.input->>'$.kind' IN ('image','video','mix')`
	err = m.db.QueryRowContext(ctx, q, user).Scan(&out.Works, &out.Running, &out.Failed)
	return
}

func (m *MySQL) JobModels(ctx context.Context, user string) ([]core.JobModelUse, error) {
	referenceID, err := m.jobReferenceID(ctx, "job_billing")
	if err != nil {
		return nil, err
	}
	q := `SELECT COALESCE(j.input->>'$.model','') AS model_key, COALESCE(j.input->>'$.kind','') AS kind_key, COUNT(*), SUM(j.status='succeeded'), SUM(j.status IN ('failed','canceled')), SUM(j.status IN ('queued','running')), COALESCE(SUM(IF(b.state='charged',b.units,0)),0), MAX(j.created_at) FROM jobs j LEFT JOIN job_billing b ON b.id=` + referenceID + ` WHERE j.user_id=? AND j.input->>'$.kind'<>'import' GROUP BY model_key,kind_key ORDER BY COUNT(*) DESC,model_key,kind_key`
	rows, e := m.db.QueryContext(ctx, q, user)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []core.JobModelUse{}
	for rows.Next() {
		var v core.JobModelUse
		if e = rows.Scan(&v.Model, &v.Kind, &v.Calls, &v.Succeeded, &v.Failed, &v.Active, &v.PointsUnits, &v.LastAt); e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (m *Memory) JobStats(_ context.Context, user string) (out core.JobStats, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, j := range m.jobs {
		if j.UserID != user || !core.IsWork(j.Input.Kind) {
			continue
		}
		var meta core.WorkMeta
		_ = json.Unmarshal(m.records["work_meta:"+j.ID].Data, &meta)
		if j.Status == "succeeded" && !meta.Deleted {
			out.Works++
		}
		if j.Status == "queued" || j.Status == "running" {
			out.Running++
		}
		if j.Status == "failed" {
			out.Failed++
		}
	}
	return
}

func (m *Memory) JobModels(_ context.Context, user string) ([]core.JobModelUse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	groups := map[string]*core.JobModelUse{}
	for _, j := range m.jobs {
		if j.UserID != user || j.Input.Kind == "import" {
			continue
		}
		key := j.Input.Model + ":" + j.Input.Kind
		v := groups[key]
		if v == nil {
			v = &core.JobModelUse{Model: j.Input.Model, Kind: j.Input.Kind}
			groups[key] = v
		}
		v.Calls++
		if j.CreatedAt.After(v.LastAt) {
			v.LastAt = j.CreatedAt
		}
		switch j.Status {
		case "succeeded":
			v.Succeeded++
		case "failed", "canceled":
			v.Failed++
		case "queued", "running":
			v.Active++
		}
		var bill core.JobBilling
		_ = json.Unmarshal(m.records["job_billing:"+j.ID].Data, &bill)
		if bill.State == "charged" {
			v.PointsUnits += bill.Units
		}
	}
	out := []core.JobModelUse{}
	for _, v := range groups {
		out = append(out, *v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Calls == out[j].Calls {
			return out[i].Model < out[j].Model
		}
		return out[i].Calls > out[j].Calls
	})
	return out, nil
}
