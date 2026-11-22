package monitor

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"doubo/server/internal/systemtools"
	"os"
	"runtime"
	"sync"
	"time"
)

type Service struct {
	Tools                   *systemtools.Detector
	Store                   store.Store
	ID, Host, Role, Webhook string
	Started                 time.Time
	mu                      sync.Mutex
	lastFallback            time.Time
}

func New(s store.Store, role, webhook string) *Service {
	host, _ := os.Hostname()
	return &Service{Store: s, Tools: systemtools.New(), ID: core.NewID(), Host: host, Role: role, Webhook: webhook, Started: time.Now().UTC()}
}
func (m *Service) Snapshot() core.NodeHealth {
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	out := core.NodeHealth{ID: m.ID, Host: m.Host, Role: m.Role, StartedAt: m.Started, SeenAt: time.Now().UTC(), HeapBytes: memory.HeapAlloc, Goroutines: runtime.NumGoroutine(), GoVersion: runtime.Version()}
	if m.Tools != nil {
		out.MediaTools = m.Tools.Latest()
	}
	if db, ok := m.Store.(interface{ PoolInfo() (int, int) }); ok {
		out.DBOpen, out.DBInUse = db.PoolInfo()
	}
	return out
}
func (m *Service) Run(ctx context.Context) {
	tick := time.NewTicker(15 * time.Second)
	defer tick.Stop()
	for {
		m.beat(ctx)
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
func (m *Service) beat(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if m.Tools != nil {
		_, _ = m.Tools.Check(ctx, false)
	}
	old, _ := m.Store.Get(ctx, "instances", m.ID)
	_, _ = m.Store.Put(ctx, "instances", core.Record{ID: m.ID, Data: core.Data(m.Snapshot())}, old.Version)
	settings := core.DefaultPlatform()
	queue, e := m.Store.QueueHealth(ctx)
	if e != nil {
		m.alert(ctx, "database", "数据库或任务状态读取失败")
		return
	}
	if queue.FailedHour >= int64(settings.AlarmFailures) {
		m.alert(ctx, "generation_failures", "最近一小时生成失败数达到告警阈值")
	}
	if queue.OldestQueued != nil && time.Since(*queue.OldestQueued) > time.Duration(settings.AlarmQueueMinutes)*time.Minute {
		m.alert(ctx, "queue_wait", "生成任务排队时间超过配置阈值")
	}
}
