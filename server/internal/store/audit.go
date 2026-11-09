package store

import (
	"context"
	"doubo/server/internal/core"
	"slices"
	"strings"
	"time"
)

// AuditLogs stores operation logs. It is separate from Store so log volume
// never touches the business tables; both drivers implement it.
type AuditLogs interface {
	AppendLogs(context.Context, []core.AuditEntry) error
	Logs(context.Context, core.AuditQuery) (core.AuditPage, error)
	Log(context.Context, string) (core.AuditEntry, error)
	// PruneLogs deletes writes older than one cutoff and plain reads (GET)
	// older than another, which is usually much shorter.
	PruneLogs(ctx context.Context, writes, reads time.Time) (int64, error)
	LogStats(context.Context, time.Time) (core.APIStats, error)
}

func logLimit(q core.AuditQuery) int {
	if q.Limit < 1 || q.Limit > 100 {
		return 50
	}
	return q.Limit
}

func containsFold(values []string, part string) bool {
	part = strings.ToLower(part)
	for _, v := range values {
		if strings.Contains(strings.ToLower(v), part) {
			return true
		}
	}
	return false
}

// matchLog applies a query to one entry (memory driver; MySQL uses SQL).
func matchLog(e core.AuditEntry, q core.AuditQuery) bool {
	switch {
	case len(q.Categories) > 0 && !slices.Contains(q.Categories, e.Category),
		q.Before != "" && e.ID >= q.Before,
		!q.From.IsZero() && e.At.Before(q.From),
		!q.To.IsZero() && !e.At.Before(q.To),
		q.Method != "" && e.Method != q.Method,
		q.WritesOnly && (e.Method == "GET" || e.Method == ""),
		q.Failed != nil && (e.Status >= 400 || e.Error != "") != *q.Failed,
		q.Actor != "" && !containsFold([]string{e.ActorID, e.ActorName}, q.Actor),
		q.ActorID != "" && e.ActorID != q.ActorID,
		q.TargetID != "" && e.TargetID != q.TargetID,
		q.Route != "" && e.Route != q.Route,
		q.Target != "" && !containsFold([]string{e.TargetID, e.TargetName}, q.Target),
		q.Search != "" && !containsFold([]string{e.Path, e.Action, e.Summary, e.Route}, q.Search):
		return false
	}
	return true
}

const memoryLogCap = 50000

func (m *Memory) AppendLogs(_ context.Context, entries []core.AuditEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logs = append(m.logs, entries...)
	if over := len(m.logs) - memoryLogCap; over > 0 {
		m.logs = append([]core.AuditEntry(nil), m.logs[over:]...)
	}
	return nil
}

func (m *Memory) Logs(_ context.Context, q core.AuditQuery) (core.AuditPage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	limit, out := logLimit(q), core.AuditPage{Items: []core.AuditEntry{}}
	for i := len(m.logs) - 1; i >= 0; i-- {
		if !matchLog(m.logs[i], q) {
			continue
		}
		if len(out.Items) == limit {
			out.Next = out.Items[limit-1].ID
			break
		}
		light := m.logs[i]
		light.Request, light.Response = "", "" // bodies only in Log(id), as in MySQL
		out.Items = append(out.Items, light)
	}
	return out, nil
}

func (m *Memory) Log(_ context.Context, id string) (core.AuditEntry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := len(m.logs) - 1; i >= 0; i-- {
		if m.logs[i].ID == id {
			return m.logs[i], nil
		}
	}
	return core.AuditEntry{}, core.ErrNotFound
}

func (m *Memory) PruneLogs(_ context.Context, writes, reads time.Time) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	kept := m.logs[:0]
	for _, e := range m.logs {
		if e.At.After(writes) && (e.Method != "GET" || e.At.After(reads)) {
			kept = append(kept, e)
		}
	}
	removed := int64(len(m.logs) - len(kept))
	m.logs = kept
	return removed, nil
}

func (m *Memory) LogStats(_ context.Context, since time.Time) (core.APIStats, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out core.APIStats
	var total int64
	users := map[string]bool{}
	for _, e := range m.logs {
		if e.Category == core.LogModel || e.At.Before(since) {
			continue
		}
		out.Requests++
		total += int64(e.DurationMs)
		if e.Status >= 500 {
			out.Errors++
		} else if e.Status >= 400 {
			out.Rejected++
		}
		if e.DurationMs > 1000 {
			out.Slow++
		}
		if e.ActorType == "user" {
			users[e.ActorID] = true
		}
	}
	if out.Requests > 0 {
		out.AvgMs = float64(total) / float64(out.Requests)
	}
	out.Users = int64(len(users))
	return out, nil
}
