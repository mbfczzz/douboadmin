package analytics

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"sync"
	"time"
)

type Recorder struct {
	Store store.Store
	mu    sync.Mutex
	day   string
	seen  map[string]bool
}

func (a *Recorder) Active(ctx context.Context, user string) {
	day := time.Now().In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")
	a.mu.Lock()
	if a.day != day {
		a.day = day
		a.seen = map[string]bool{}
	}
	if a.seen[user] {
		a.mu.Unlock()
		return
	}
	a.mu.Unlock()
	_, e := a.Store.Put(ctx, "daily_activity", core.Record{ID: core.Digest(day + ":" + user)[:32], Owner: user, Data: core.Data(map[string]string{"day": day})}, 0)
	if e == nil || e == core.ErrConflict {
		a.mu.Lock()
		if a.day == day {
			a.seen[user] = true
		}
		a.mu.Unlock()
	}
}
