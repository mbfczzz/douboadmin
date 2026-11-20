package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ownChat is the requesting user's chat turn, or a 404 already written.
func (a *Server) ownChat(w http.ResponseWriter, r *http.Request) (core.Job, bool) {
	j, e := a.Store.Job(r.Context(), r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return j, false
	}
	if j.UserID != identity(r).ID || j.Input.Kind != "chat" {
		fail(w, 404, "任务不存在")
		return j, false
	}
	return j, true
}

func writing(status string) bool { return status == "queued" || status == "running" }

// jobReply is the reply so far, for clients that cannot read a stream.
func (a *Server) jobReply(w http.ResponseWriter, r *http.Request) {
	j, ok := a.ownChat(w, r)
	if !ok {
		return
	}
	text := ""
	if j.Status == "running" {
		text = provider.Partial(r.Context(), a.Store, j.ID)
	}
	reply(w, 200, map[string]string{"status": j.Status, "text": text})
}

// streamFor is how long one stream stays open; the client reconnects (and
// gets the whole reply so far again) when a long reply outlasts it.
var streamFor = 2 * time.Minute

// jobStream sends a reply as it is written, as server-sent events:
// {"text": whole reply so far} first, then {"delta": new text}, and
// {"done": true, "status": …} when the turn ends ({"again": true} when the
// client should reconnect).
func (a *Server) jobStream(w http.ResponseWriter, r *http.Request) {
	j, ok := a.ownChat(w, r)
	if !ok {
		return
	}
	ctx, id := r.Context(), j.ID
	h := w.Header()
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no") // nginx: pass each event on at once
	rc := http.NewResponseController(w)
	send := func(v any) bool {
		_ = rc.SetWriteDeadline(time.Now().Add(20 * time.Second))
		b, _ := json.Marshal(v)
		if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
			return false
		}
		return rc.Flush() == nil
	}
	status, sent, first := j.Status, 0, true
	checked, end, ping := time.Now(), time.Now().Add(streamFor), time.Now()
	for {
		if time.Since(checked) > time.Second {
			cur, err := a.Store.Job(ctx, id)
			if err != nil {
				return
			}
			status, checked = cur.Status, time.Now()
		}
		if !writing(status) {
			send(map[string]any{"done": true, "status": status})
			return
		}
		text, changed, live := provider.Turns.Watch(id)
		if !live {
			text = provider.Partial(ctx, a.Store, id)
		}
		runes := []rune(text)
		switch {
		case len(runes) < sent && !first:
			// The turn just ended (its partial is cleared before the job's
			// status flips): keep what was shown; "done" follows.
		case first:
			if !send(map[string]string{"text": text}) {
				return
			}
			sent, first, ping = len(runes), false, time.Now()
		case len(runes) > sent:
			if !send(map[string]string{"delta": string(runes[sent:])}) {
				return
			}
			sent, ping = len(runes), time.Now()
		case time.Since(ping) > 10*time.Second: // keep proxies from closing a quiet stream
			if !send(map[string]bool{"ping": true}) {
				return
			}
			ping = time.Now()
		}
		if time.Now().After(end) {
			send(map[string]bool{"again": true})
			return
		}
		wait := time.NewTimer(200 * time.Millisecond)
		select {
		case <-ctx.Done():
			wait.Stop()
			return
		case <-changed: // nil (blocks) when written in another process
		case <-wait.C:
		}
		wait.Stop()
	}
}

// stopReply stops the user's reply being written; what was written is kept
// and charged, a turn stopped before any words is refunded.
func (a *Server) stopReply(w http.ResponseWriter, r *http.Request) {
	j, ok := a.ownChat(w, r)
	if !ok {
		return
	}
	if writing(j.Status) {
		if err := provider.StopChat(r.Context(), a.Store, j.ID, j.UserID); err != nil {
			dbError(w, err)
			return
		}
	}
	reply(w, 200, map[string]string{"status": j.Status})
}
