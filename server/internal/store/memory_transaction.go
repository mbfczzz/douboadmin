package store

import (
	"context"
	"doubo/server/internal/core"
	"strings"
	"time"
)

func (t *memoryTransaction) HasRecords(ns string) (bool, error) {
	for key := range t.records {
		if strings.HasPrefix(key, ns+":") {
			return true, nil
		}
	}
	return false, nil
}

type memoryTransaction struct {
	records map[string]core.Record
	jobs    map[string]core.Job
}

func (m *Memory) Atomic(_ context.Context, fn func(Transaction) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t := &memoryTransaction{records: map[string]core.Record{}, jobs: map[string]core.Job{}}
	for k, v := range m.records {
		t.records[k] = copyRecord(v)
	}
	for k, v := range m.jobs {
		t.jobs[k] = copyJob(v)
	}
	if err := fn(t); err != nil {
		return err
	}
	m.records = t.records
	m.jobs = t.jobs
	return nil
}
func (t *memoryTransaction) Get(ns, id string) (core.Record, error) {
	r, ok := t.records[ns+":"+id]
	if !ok {
		return r, core.ErrNotFound
	}
	return copyRecord(r), nil
}
func (t *memoryTransaction) Lock(ns string, r core.Record) (core.Record, error) {
	if len(r.Data) == 0 {
		return t.Get(ns, r.ID)
	}
	if old, e := t.Get(ns, r.ID); e == nil {
		return old, nil
	}
	return t.Put(ns, r, 0)
}
func (t *memoryTransaction) Put(ns string, r core.Record, version int64) (core.Record, error) {
	old, ok := t.records[ns+":"+r.ID]
	if (ok && old.Version != version) || (!ok && version != 0) {
		return r, core.ErrConflict
	}
	r.Version = version + 1
	r.CreatedAt = old.CreatedAt
	if !ok {
		r.CreatedAt = time.Now().UTC()
	}
	t.records[ns+":"+r.ID] = copyRecord(r)
	return r, nil
}
func (t *memoryTransaction) Job(id string) (core.Job, error) {
	j, ok := t.jobs[id]
	if !ok {
		return j, core.ErrNotFound
	}
	return copyJob(j), nil
}
func (t *memoryTransaction) InsertJob(j core.Job) error {
	if _, ok := t.jobs[j.ID]; ok {
		return core.ErrConflict
	}
	t.jobs[j.ID] = copyJob(j)
	return nil
}
func (t *memoryTransaction) CompleteJob(j core.Job, result, failure string) error {
	old, ok := t.jobs[j.ID]
	if !ok || old.Status != "running" || old.LeaseToken != j.LeaseToken || !old.LeaseUntil.After(time.Now()) {
		return core.ErrConflict
	}
	old.Status = "succeeded"
	if failure != "" {
		old.Status = "failed"
	}
	old.Result = result
	old.Error = failure
	old.Progress = 100
	old.UpdatedAt = time.Now().UTC()
	t.jobs[j.ID] = old
	return nil
}
func (t *memoryTransaction) ResumeJob(id string) error {
	j, ok := t.jobs[id]
	if !ok || j.Status != "failed" {
		return core.ErrConflict
	}
	j.Status = "queued"
	j.Progress = 0
	j.Error = ""
	j.LeaseToken = ""
	j.LeaseUntil = time.Time{}
	j.UpdatedAt = time.Now().UTC()
	t.jobs[id] = j
	return nil
}
