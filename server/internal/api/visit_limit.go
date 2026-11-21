package api

import (
	"sync"
	"time"
)

// visitLimit caps anonymous visit beacons per client IP (fixed one-minute
// windows), so the public endpoint cannot be used to flood the store.
type visitLimit struct {
	mu     sync.Mutex
	window time.Time
	counts map[string]int
	// max per IP and minute; 0 = visitsPerMinute.
	max int
}

const visitsPerMinute = 120

// clicksPerMinute: 功能使用 taps; many phones can share one carrier or
// office IP, so the cap only stops floods.
const clicksPerMinute = 1200

func (l *visitLimit) allow(ip string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.window) >= time.Minute || l.counts == nil {
		l.window, l.counts = now, map[string]int{}
	}
	l.counts[ip]++
	limit := l.max
	if limit == 0 {
		limit = visitsPerMinute
	}
	return l.counts[ip] <= limit
}
