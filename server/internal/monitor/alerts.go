package monitor

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"net/http"
	"strings"
	"time"
)

func (m *Service) alert(ctx context.Context, kind, message string) {
	// One shared alert per incident category per ten minutes, including multiple API/worker replicas.
	period := time.Now().UTC().Truncate(10 * time.Minute).Format(time.RFC3339)
	id := core.Digest(kind + ":" + period)[:32]
	_, e := m.Store.Put(ctx, "alerts", core.Record{ID: id, Data: core.Data(core.Alert{Kind: kind, Message: message})}, 0)
	if e != nil {
		if e == core.ErrConflict || kind != "database" {
			return
		}
		m.mu.Lock()
		if time.Since(m.lastFallback) < 10*time.Minute {
			m.mu.Unlock()
			return
		}
		m.lastFallback = time.Now()
		m.mu.Unlock()
	}
	if m.Webhook == "" {
		return
	}
	body := core.Data(map[string]any{"msgtype": "text", "text": map[string]string{"content": "豆播运行告警：" + message}})
	req, e := http.NewRequestWithContext(ctx, "POST", m.Webhook, bytes.NewReader(body))
	if e != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, e := client.Do(req)
	if e == nil {
		response.Body.Close()
		if response.StatusCode < 300 {
			return
		}
	}
	_, _ = m.Store.Put(ctx, "error_logs", core.Record{ID: core.NewID(), Data: core.Data(core.ErrorLog{Level: "WARN", Message: "告警通知发送失败", Detail: strings.TrimSpace(kind), Node: m.ID})}, 0)
}
