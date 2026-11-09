package audit

import (
	"context"
	"doubo/server/internal/core"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestBodyRedactsSecretsAndShortensBlobs(t *testing.T) {
	raw := `{"username":"ops","password":"hunter2-long","values":{"WECHAT_APP_SECRET":"s3cr3t-value","RELAY_BASE_URL":"https://relay.example"},"description":"keep me","key":"gpt-image","image":"data:image/png;base64,` + strings.Repeat("A", 5000) + `"}`
	got := Body([]byte(raw), false)
	for _, leak := range []string{"hunter2-long", "s3cr3t-value", strings.Repeat("A", 200)} {
		if strings.Contains(got, leak) {
			t.Fatalf("leaked %q in %s", leak[:10], got)
		}
	}
	for _, kept := range []string{`"username":"ops"`, `"description":"keep me"`, `"key":"gpt-image"`, "https://relay.example", "共 5022 字符"} {
		if !strings.Contains(got, kept) {
			t.Fatalf("missing %q in %s", kept, got)
		}
	}
	if Body([]byte("not json"), false) != "（非 JSON 内容，8 字节）" {
		t.Fatal("non-JSON bodies are summarised")
	}
	if long := Cap(strings.Repeat("积", MaxBody)); len(long) > MaxBody+30 || !strings.HasSuffix(long, "（已截断）") {
		t.Fatal("cap keeps whole characters and marks truncation")
	}
}

type sink struct {
	mu      sync.Mutex
	entries []core.AuditEntry
}

func (s *sink) AppendLogs(_ context.Context, e []core.AuditEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = append(s.entries, e...)
	return nil
}

func TestWriterBatchesResolvesNamesAndMasksSecretValues(t *testing.T) {
	s, lookups := &sink{}, 0
	w := NewWriter(s, func(_ context.Context, kind, id string) string {
		lookups++
		return kind + "-" + id
	})
	w.SetSecrets([]string{"sk-live-123456"})
	for range 3 {
		w.Add(core.AuditEntry{ActorType: "admin", ActorID: "a1", TargetType: "user", TargetID: "u1", Request: `{"note":"sk-live-123456"}`})
	}
	w.Close()
	if len(s.entries) != 3 {
		t.Fatal("entries", len(s.entries))
	}
	e := s.entries[0]
	if e.ActorName != "admin-a1" || e.TargetName != "user-u1" || strings.Contains(e.Request, "sk-live") || e.ID == "" || e.At.IsZero() {
		t.Fatalf("entry %+v", e)
	}
	if lookups != 2 {
		t.Fatal("names are cached", lookups)
	}
	if NewID(time.UnixMilli(2)) <= NewID(time.UnixMilli(1)) {
		t.Fatal("ids sort by time")
	}
}

func TestWriterNeverBlocksWhenFull(t *testing.T) {
	w := &Writer{queue: make(chan core.AuditEntry, 1)}
	done := make(chan struct{})
	go func() {
		for range 5 {
			w.Add(core.AuditEntry{})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Add blocked")
	}
	if w.Dropped() != 4 {
		t.Fatal("dropped", w.Dropped())
	}
}
