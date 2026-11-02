package main

import (
	"context"
	"doubo/server/internal/api"
	"doubo/server/internal/monitor"
	"doubo/server/internal/notifications"
	"doubo/server/internal/payments"
	"encoding/json"
	"log/slog"
	"os"
)

func background(ctx context.Context, app *api.Server, role string) {
	var fields map[string]string
	_ = json.Unmarshal([]byte(os.Getenv("WECHAT_COMPLETION_FIELDS")), &fields)
	sender := &notifications.Sender{Store: app.Store, WeChat: app.WeChat, TemplateID: app.Config.CompletionTemplateID, Fields: fields}
	app.Config.CompletionReady = sender.Ready()
	go sender.Run(ctx)
	metrics := monitor.New(app.Store, role, os.Getenv("ALERT_WEBHOOK_URL"))
	secrets := []string{}
	for _, key := range []string{"RELAY_API_KEY", "WECHAT_APP_SECRET", "WECHAT_PAY_API_V3_KEY", "TIKHUB_API_KEY", "ASR_API_KEY", "OSS_ACCESS_KEY_SECRET", "REDIS_PASSWORD", "MYSQL_DSN", "ADMIN_PASSWORD", "ALERT_WEBHOOK_URL"} {
		if v := os.Getenv(key); v != "" {
			secrets = append(secrets, v)
		}
	}
	slog.SetDefault(slog.New(monitor.NewLogHandler(ctx, slog.NewTextHandler(os.Stderr, nil), app.Store, metrics.ID, secrets)))
	go metrics.Run(ctx)
	go payments.Reconcile(ctx, app.Store, app.Pay, app.Billing)
	go app.Partners.Run(ctx)
}
