package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"sort"
	"sync"
	"time"
)

// Memory is used by isolated tests. Applications use shared MySQL storage.
type Memory struct {
	mu      sync.Mutex
	records map[string]core.Record
	jobs    map[string]core.Job
}

func NewMemory() *Memory {
	return &Memory{records: map[string]core.Record{}, jobs: map[string]core.Job{}}
}
func copyRecord(r core.Record) core.Record { r.Data = append(json.RawMessage{}, r.Data...); return r }
func copyJob(j core.Job) core.Job {
	j.Input.Assets = append([]string{}, j.Input.Assets...)
	if j.Input.ExpectedCostUnits != nil {
		v := *j.Input.ExpectedCostUnits
		j.Input.ExpectedCostUnits = &v
	}
	if j.EstimatedCostMicros != nil {
		v := *j.EstimatedCostMicros
		j.EstimatedCostMicros = &v
	}
	return j
}
func (m *Memory) Get(_ context.Context, ns, id string) (core.Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.records[ns+":"+id]
	if !ok {
		return r, core.ErrNotFound
	}
	return copyRecord(r), nil
}
func (m *Memory) List(_ context.Context, ns, owner string) ([]core.Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []core.Record{}
	for k, r := range m.records {
		if len(k) > len(ns) && k[:len(ns)+1] == ns+":" && (owner == "" || r.Owner == owner) {
			out = append(out, copyRecord(r))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > 500 {
		out = out[:500]
	}
	return out, nil
}
func (m *Memory) Put(_ context.Context, ns string, r core.Record, version int64) (core.Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	old, ok := m.records[ns+":"+r.ID]
	if (ok && old.Version != version) || (!ok && version != 0) {
		return r, core.ErrConflict
	}
	r.Version = version + 1
	if ok {
		r.CreatedAt = old.CreatedAt
	} else {
		r.CreatedAt = time.Now().UTC()
	}
	m.records[ns+":"+r.ID] = copyRecord(r)
	return r, nil
}
func (m *Memory) CreateJob(ctx context.Context, j core.Job) (core.Job, error) {
	return createFundedJob(ctx, m, j)
}

func (m *Memory) Jobs(_ context.Context, user string) ([]core.Job, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []core.Job{}
	for _, j := range m.jobs {
		if user == "" || j.UserID == user {
			out = append(out, copyJob(j))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > 200 {
		out = out[:200]
	}
	return out, nil
}
func (m *Memory) Job(_ context.Context, id string) (core.Job, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.jobs[id]
	if !ok {
		return j, core.ErrNotFound
	}
	return copyJob(j), nil
}
func (m *Memory) Claim(_ context.Context) (core.Job, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UTC()
	var candidate *core.Job
	for _, j := range m.jobs {
		if j.Status == "queued" || (j.Status == "running" && !j.LeaseUntil.After(now)) {
			if candidate == nil || j.UpdatedAt.Before(candidate.UpdatedAt) {
				c := j
				candidate = &c
			}
		}
	}
	if candidate == nil {
		return core.Job{}, core.ErrNotFound
	}
	j := *candidate
	j.Status = "running"
	j.Attempts++
	j.LeaseToken = core.NewID()
	j.LeaseUntil = now.Add(time.Minute)
	j.UpdatedAt = now
	m.jobs[j.ID] = j
	return copyJob(j), nil
}
func (m *Memory) Finish(ctx context.Context, j core.Job, result, failure string) error {
	return finishFundedJob(ctx, m, j, result, failure)
}

func (m *Memory) Ping(context.Context) error { return nil }
func (m *Memory) Close() error               { return nil }
