package api

import (
	"bytes"
	"context"
	"doubo/server/internal/audit"
	"doubo/server/internal/core"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// auditInfo travels in the request context: auth fills in who is calling,
// handlers may add a target or summary the route table cannot know.
type auditInfo struct {
	who                          *Identity
	actorName                    string
	targetType, targetID, detail string
}

type auditKey struct{}

func auditFrom(ctx context.Context) *auditInfo {
	info, _ := ctx.Value(auditKey{}).(*auditInfo)
	return info
}

// auditActor records the caller once authentication has resolved it.
func auditActor(r *http.Request, who Identity) {
	if info := auditFrom(r.Context()); info != nil {
		info.who = &who
	}
}

// Requests not worth a log line: health probes, anonymous visit beacons and
// the log viewer reading its own data.
func audited(r *http.Request) bool {
	p := r.URL.Path
	return strings.HasPrefix(p, "/api/") && p != "/api/visits" && p != "/api/events" &&
		!(r.Method == "GET" && strings.HasPrefix(p, "/api/admin/audit"))
}

// capture tees up to MaxBody bytes of a body while the handler reads it.
type capture struct {
	buf  bytes.Buffer
	over bool
}

func (c *capture) Write(p []byte) (int, error) {
	room := audit.MaxBody*4 - c.buf.Len()
	if room <= 0 {
		c.over = true
		return len(p), nil
	}
	if len(p) > room {
		c.over = true
		p = p[:room]
	}
	return c.buf.Write(p)
}

type teeBody struct {
	io.Reader
	io.Closer
}

// recorder keeps the status and the start of the response body.
type recorder struct {
	http.ResponseWriter
	status int
	size   int
	body   capture
}

func (w *recorder) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *recorder) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = 200
	}
	w.size += len(p)
	_, _ = w.body.Write(p)
	return w.ResponseWriter.Write(p)
}

func (w *recorder) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	// Behind the local reverse proxy, trust only what the proxy itself set:
	// X-Real-IP, else the last X-Forwarded-For hop (earlier hops come from the client).
	if ip := net.ParseIP(host); ip != nil && (ip.IsLoopback() || ip.IsPrivate()) {
		if real := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); real != nil {
			return real.String()
		}
		hops := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		if last := net.ParseIP(strings.TrimSpace(hops[len(hops)-1])); last != nil {
			return last.String()
		}
	}
	return host
}

// serveAudited runs the request and queues one log entry for it.
func (a *Server) serveAudited(w http.ResponseWriter, r *http.Request) {
	start, info := time.Now(), &auditInfo{}
	r = r.WithContext(context.WithValue(r.Context(), auditKey{}, info))
	in := &capture{}
	// File uploads are summarised by size; everything else is teed.
	upload := strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/")
	if r.Body != nil && r.Method != "GET" && !upload {
		r.Body = teeBody{io.TeeReader(r.Body, in), r.Body}
	}
	rec := &recorder{ResponseWriter: w}
	defer func() {
		status := rec.status
		if p := recover(); p != nil {
			status = 500
			defer panic(p)
		}
		a.queueRequestLog(r, info, in, rec, status, time.Since(start))
	}()
	a.Mux.ServeHTTP(rec, r)
}

func (a *Server) queueRequestLog(r *http.Request, info *auditInfo, in *capture, rec *recorder, status int, took time.Duration) {
	e := core.AuditEntry{
		At: time.Now().Add(-took), Category: core.LogAPI, ActorType: "guest",
		Method: r.Method, Route: r.Pattern, Path: r.URL.RequestURI(), Status: status,
		DurationMs: int(took.Milliseconds()), IP: clientIP(r), UserAgent: r.UserAgent(),
	}
	if status == 0 {
		e.Status = 200
	}
	if who := info.who; who != nil {
		e.ActorID, e.ActorType = who.ID, actorType(*who)
	}
	if r.Method != "GET" {
		e.Request = audit.Request(in.buf.Bytes(), in.over)
		if e.Request == "" && r.ContentLength > 0 {
			e.Request = "（" + r.Header.Get("Content-Type") + "，" + strconv.FormatInt(r.ContentLength, 10) + " 字节）"
		}
	}
	// Reads that succeed are frequent and repetitive: keep only their size.
	if r.Method != "GET" || e.Status >= 400 {
		e.Response = audit.Body(rec.body.buf.Bytes(), rec.body.over)
	} else {
		e.Response = "（" + strconv.Itoa(rec.size) + " 字节）"
	}
	describe(r, info, &e)
	a.Audit.Add(e)
}

func actorType(who Identity) string {
	switch {
	case who.Role == "user":
		return "user"
	case who.PartnerID != "":
		return "provider"
	case who.Role == "admin":
		return "admin"
	}
	return "guest"
}
