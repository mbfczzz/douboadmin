package api

import (
	"doubo/server/internal/core"
	"sync"
	"time"
)

// Report days and log filters use Beijing time, like the dashboard.
var reportZone = time.FixedZone("CST", 8*60*60)

// auditStatsCache keeps each period's request statistics for a minute.
type auditStatsCache struct {
	mu   sync.Mutex
	vals map[int]cachedStats
}

type cachedStats struct {
	at    time.Time
	stats core.APIStats
}

func (c *auditStatsCache) get(days int, load func() (core.APIStats, error)) (core.APIStats, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if v, ok := c.vals[days]; ok && time.Since(v.at) < time.Minute {
		return v.stats, nil
	}
	stats, err := load()
	if err == nil {
		if c.vals == nil {
			c.vals = map[int]cachedStats{}
		}
		c.vals[days] = cachedStats{time.Now(), stats}
	}
	return stats, err
}
