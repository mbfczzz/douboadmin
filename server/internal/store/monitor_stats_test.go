package store

import (
	"doubo/server/internal/core"
	"fmt"
	"testing"
	"time"
)

func TestMonitorErrorCountUsesLastOccurrenceAndHasNoListLimit(t *testing.T) {
	s := NewMemory()
	now := time.Now().UTC()
	since := now.Add(-time.Hour)
	for i := range 521 {
		id := fmt.Sprintf("log-%04d", i)
		if _, err := s.Put(t.Context(), "error_logs", core.Record{ID: id, Data: core.Data(core.ErrorLog{Level: "ERROR", LastAt: now, Count: 12})}, 0); err != nil {
			t.Fatal(err)
		}
	}
	for _, sample := range []struct {
		id, level string
		lastAt    time.Time
	}{
		{"old", "ERROR", since.Add(-time.Second)},
		{"boundary", "ERROR", since},
		{"warn", "WARN", now},
		{"fallback", "ERROR", time.Time{}},
	} {
		if _, err := s.Put(t.Context(), "error_logs", core.Record{ID: sample.id, Data: core.Data(core.ErrorLog{Level: sample.level, LastAt: sample.lastAt})}, 0); err != nil {
			t.Fatal(err)
		}
	}
	count, err := CountErrorsSince(t.Context(), s, since)
	if err != nil || count != 522 {
		t.Fatal(count, err)
	}
	// A recent repeat of an old row remains in the window; createdAt is only
	// consulted when the event has no lastAt value.
	s.mu.Lock()
	for key, row := range s.records {
		row.CreatedAt = since.Add(-24 * time.Hour)
		s.records[key] = row
	}
	s.mu.Unlock()
	count, err = CountErrorsSince(t.Context(), s, since)
	if err != nil || count != 521 {
		t.Fatal(count, err)
	}
}
