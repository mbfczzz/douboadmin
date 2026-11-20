package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"sync"
	"time"
)

// Live carries replies being written to readers in the same process at once
// (the API's stream reads them as they grow); a worker in another process is
// read from executions.partial instead.
type Live struct {
	mu    sync.Mutex
	turns map[string]*liveTurn
}

type liveTurn struct {
	text    string
	changed chan struct{} // closed and replaced on every change
	cancel  context.CancelFunc
}

// Turns is this process's replies in progress.
var Turns = &Live{turns: map[string]*liveTurn{}}

func (l *Live) start(id string, cancel context.CancelFunc) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.turns[id] = &liveTurn{changed: make(chan struct{}), cancel: cancel}
}

func (l *Live) set(id, text string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if t := l.turns[id]; t != nil {
		t.text = text
		close(t.changed)
		t.changed = make(chan struct{})
	}
}

func (l *Live) finish(id string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if t := l.turns[id]; t != nil {
		close(t.changed)
		delete(l.turns, id)
	}
}

// Watch returns the reply so far and a channel closed at its next change;
// ok is false when the reply is not being written in this process.
func (l *Live) Watch(id string) (text string, changed <-chan struct{}, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	t := l.turns[id]
	if t == nil {
		return "", nil, false
	}
	return t.text, t.changed, true
}

func (l *Live) stop(id string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if t := l.turns[id]; t != nil {
		t.cancel()
	}
}

// StopChat asks a reply to stop: a marker any worker can see, and at once
// when it is being written in this process. The worker keeps what was
// written and charges for it.
func StopChat(ctx context.Context, s store.Store, id, owner string) error {
	_, err := s.Put(ctx, "chat_stops", core.Record{ID: id, Owner: owner, Data: core.Data(map[string]time.Time{"at": time.Now().UTC()})}, 0)
	if err != nil && !errors.Is(err, core.ErrConflict) {
		return err
	}
	Turns.stop(id)
	return nil
}

func stopAsked(ctx context.Context, s store.Store, id string) bool {
	_, err := s.Get(ctx, "chat_stops", id)
	return err == nil
}

// watchStop cancels a reply from another process's stop marker.
func watchStop(ctx context.Context, s store.Store, id string, cancel context.CancelFunc) {
	tick := time.NewTicker(500 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if stopAsked(ctx, s, id) {
				cancel()
				return
			}
		}
	}
}
