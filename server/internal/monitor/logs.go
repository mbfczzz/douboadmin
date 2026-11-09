package monitor

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

type LogHandler struct {
	base    slog.Handler
	node    string
	secrets []string
	attrs   []slog.Attr
	queue   chan core.ErrorLog
}

func NewLogHandler(ctx context.Context, base slog.Handler, s store.Store, node string, secrets []string) *LogHandler {
	h := &LogHandler{base: base, node: node, secrets: secrets, queue: make(chan core.ErrorLog, 128)}
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case entry := <-h.queue:
				write, cancel := context.WithTimeout(ctx, 2*time.Second)
				saveLog(write, s, entry, time.Now().UTC())
				cancel()
			}
		}
	}()
	return h
}
func (h *LogHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.base.Enabled(ctx, level)
}
func (h *LogHandler) scrub(s string) string {
	for _, v := range h.secrets {
		if len(v) > 3 {
			s = strings.ReplaceAll(s, v, "[redacted]")
		}
	}
	if len(s) > 4000 {
		s = s[:4000]
	}
	return s
}
func (h *LogHandler) Handle(ctx context.Context, r slog.Record) error {
	clean := slog.NewRecord(r.Time, r.Level, h.scrub(r.Message), r.PC)
	details := []string{}
	add := func(a slog.Attr) bool {
		key := strings.ToLower(a.Key)
		v := h.scrub(fmt.Sprint(a.Value.Any()))
		if strings.Contains(key, "secret") || strings.Contains(key, "password") || strings.Contains(key, "token") || strings.Contains(key, "authorization") {
			v = "[redacted]"
		}
		clean.AddAttrs(slog.String(a.Key, v))
		details = append(details, a.Key+"="+v)
		return true
	}
	for _, a := range h.attrs {
		add(a)
	}
	r.Attrs(add)
	if r.Level >= slog.LevelWarn {
		select {
		case h.queue <- core.ErrorLog{Level: r.Level.String(), Message: clean.Message, Detail: strings.Join(details, " "), Node: h.node}:
		default:
		}
	}
	return h.base.Handle(ctx, clean)
}
func (h *LogHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	copy := *h
	copy.attrs = append(append([]slog.Attr{}, h.attrs...), attrs...)
	return &copy
}
func (h *LogHandler) WithGroup(name string) slog.Handler {
	copy := *h
	copy.base = h.base.WithGroup(name)
	return &copy
}

// saveLog folds repeats of the same entry from one node within an hour into a
// single row with a count, so a retry loop cannot bury other errors.
func saveLog(ctx context.Context, s store.Store, entry core.ErrorLog, now time.Time) {
	id := core.Digest(strings.Join([]string{entry.Node, entry.Level, entry.Message, entry.Detail, now.Format("2006010215")}, "\x00"))[:32]
	entry.Count, entry.LastAt = 1, now
	row, err := s.Get(ctx, "error_logs", id)
	if errors.Is(err, core.ErrNotFound) {
		_, _ = s.Put(ctx, "error_logs", core.Record{ID: id, Data: core.Data(entry)}, 0)
		return
	}
	if err != nil {
		return
	}
	var old core.ErrorLog
	if json.Unmarshal(row.Data, &old) == nil {
		entry.Count = max(old.Count, 1) + 1
	}
	row.Data = core.Data(entry)
	_, _ = s.Put(ctx, "error_logs", row, row.Version)
}
