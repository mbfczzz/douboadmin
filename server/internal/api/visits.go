package api

import (
	"doubo/server/internal/analytics"
	"net/http"
	"time"
)

// visit records an anonymous page view. It is public on purpose: visit
// statistics never read the session, so they cannot be tied to an account.
func (a *Server) visit(w http.ResponseWriter, r *http.Request) {
	if !a.visitLimit.allow(clientIP(r), time.Now()) {
		w.WriteHeader(204) // silently dropped; beacons never retry
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	var v analytics.PageView
	if !decode(w, r, &v) {
		return
	}
	if !v.Valid() {
		fail(w, 400, "访问记录格式无效")
		return
	}
	if e := a.Visits.Record(r.Context(), v, time.Now().UTC()); e != nil {
		dbError(w, e)
		return
	}
	w.WriteHeader(204)
}
