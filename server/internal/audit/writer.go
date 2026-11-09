// Package audit records operation logs off the request path: handlers hand
// entries to a buffered channel and return; one goroutine resolves names
// and writes them in batches.
package audit

import (
	"context"
	"crypto/rand"
	"doubo/server/internal/core"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Sink is where batches go (store.AuditLogs).
type Sink interface {
	AppendLogs(context.Context, []core.AuditEntry) error
}

// Names turns ids into display names ("user", id) → nickname, etc.
type Names func(ctx context.Context, kind, id string) string

type Writer struct {
	sink    Sink
	names   Names
	queue   chan core.AuditEntry
	dropped atomic.Int64
	cache   sync.Map // kind:id → cachedName
	done    chan struct{}
	secrets atomic.Value // []string of configured secret values
}

// SetSecrets lists secret values (API keys, app secrets) to mask anywhere
// in a logged body, as a second line of defence after field-name redaction.
func (w *Writer) SetSecrets(values []string) {
	if w == nil {
		return
	}
	kept := []string{}
	for _, v := range values {
		if len(v) >= 6 {
			kept = append(kept, v)
		}
	}
	w.secrets.Store(kept)
}

type cachedName struct {
	name string
	at   time.Time
}

// NewWriter starts the background flusher; Close drains it.
func NewWriter(sink Sink, names Names) *Writer {
	w := &Writer{sink: sink, names: names, queue: make(chan core.AuditEntry, 8192), done: make(chan struct{})}
	go w.run()
	return w
}

// NewID is time-ordered (sorts by creation) and unique: 13 hex digits of
// milliseconds + 13 random hex digits = 26 characters.
func NewID(at time.Time) string {
	b := make([]byte, 7)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%013x", at.UnixMilli()) + hex.EncodeToString(b)[:13]
}

// Add never blocks: when the buffer is full the entry is dropped and counted.
func (w *Writer) Add(e core.AuditEntry) {
	if w == nil {
		return
	}
	if e.At.IsZero() {
		e.At = time.Now()
	}
	if e.ID == "" {
		e.ID = NewID(e.At)
	}
	select {
	case w.queue <- e:
	default:
		w.dropped.Add(1)
	}
}

// Dropped reports entries lost to a full buffer since start.
func (w *Writer) Dropped() int64 {
	if w == nil {
		return 0
	}
	return w.dropped.Load()
}

func (w *Writer) Close() {
	close(w.queue)
	<-w.done
}

func (w *Writer) run() {
	defer close(w.done)
	batch := make([]core.AuditEntry, 0, 200)
	tick := time.NewTicker(500 * time.Millisecond)
	defer tick.Stop()
	swept := time.Now()
	flush := func() {
		if len(batch) == 0 {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		for i := range batch {
			w.resolve(ctx, &batch[i])
		}
		if err := w.sink.AppendLogs(ctx, batch); err != nil {
			slog.Warn("audit log write failed", "entries", len(batch), "error", err)
		}
		cancel()
		batch = batch[:0]
	}
	for {
		select {
		case e, ok := <-w.queue:
			if !ok {
				flush()
				return
			}
			batch = append(batch, e)
			if len(batch) == cap(batch) {
				flush()
			}
		case <-tick.C:
			flush()
			// Bound the name cache: drop expired entries every few minutes.
			if time.Since(swept) > 5*time.Minute {
				swept = time.Now()
				w.cache.Range(func(k, v any) bool {
					if time.Since(v.(cachedName).at) > 5*time.Minute {
						w.cache.Delete(k)
					}
					return true
				})
			}
		}
	}
}

func (w *Writer) mask(e *core.AuditEntry) {
	values, _ := w.secrets.Load().([]string)
	for _, v := range values {
		for _, field := range []*string{&e.Request, &e.Response, &e.Error, &e.Path} {
			if strings.Contains(*field, v) {
				*field = strings.ReplaceAll(*field, v, "***")
			}
		}
	}
}

func (w *Writer) resolve(ctx context.Context, e *core.AuditEntry) {
	w.mask(e)
	if e.ActorName == "" && e.ActorID != "" {
		e.ActorName = w.name(ctx, e.ActorType, e.ActorID)
	}
	if e.TargetName == "" && e.TargetID != "" {
		e.TargetName = w.name(ctx, e.TargetType, e.TargetID)
	}
}

// Name is the cached lookup, for callers off the request path.
func (w *Writer) Name(ctx context.Context, kind, id string) string {
	return w.name(ctx, kind, id)
}

// name caches lookups for five minutes; misses are cached too.
func (w *Writer) name(ctx context.Context, kind, id string) string {
	if w.names == nil || kind == "" {
		return ""
	}
	key := kind + ":" + id
	if v, ok := w.cache.Load(key); ok && time.Since(v.(cachedName).at) < 5*time.Minute {
		return v.(cachedName).name
	}
	name := w.names(ctx, kind, id)
	w.cache.Store(key, cachedName{name, time.Now()})
	return name
}
