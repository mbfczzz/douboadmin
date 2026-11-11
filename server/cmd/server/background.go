package main

import (
	"context"
	"doubo/server/internal/api"
	"doubo/server/internal/media"
	"doubo/server/internal/monitor"
	"doubo/server/internal/notifications"
	"doubo/server/internal/payments"
	"doubo/server/internal/settings"
	"encoding/json"
	"log/slog"
	"os"
	"strconv"
	"time"
)

func envDays(key string, fallback int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil && n > 0 {
		return n
	}
	return fallback
}

func background(ctx context.Context, app *api.Server, role string, values settings.Values) {
	var fields map[string]string
	_ = json.Unmarshal([]byte(values["WECHAT_COMPLETION_FIELDS"]), &fields)
	sender := &notifications.Sender{Store: app.Store, WeChat: app.WeChat, TemplateID: app.Config.CompletionTemplateID, Fields: fields}
	app.Config.CompletionReady = sender.Ready()
	go sender.Run(ctx)
	metrics := monitor.New(app.Store, role, values["ALERT_WEBHOOK_URL"])
	secrets := values.Secrets()
	for _, key := range []string{"RELAY_API_KEY", "WECHAT_APP_SECRET", "WECHAT_PAY_API_V3_KEY", "WECHAT_VIRTUAL_APP_KEY", "WECHAT_VIRTUAL_SANDBOX_APP_KEY", "WECHAT_VIRTUAL_TOKEN", "WECHAT_VIRTUAL_ENCODING_AES_KEY", "TIKHUB_API_KEY", "OSS_ACCESS_KEY_SECRET", "REDIS_PASSWORD", "MYSQL_DSN", "ADMIN_PASSWORD", "ALERT_WEBHOOK_URL"} {
		if v := os.Getenv(key); v != "" {
			secrets = append(secrets, v)
		}
	}
	slog.SetDefault(slog.New(monitor.NewLogHandler(ctx, slog.NewTextHandler(os.Stderr, nil), app.Store, metrics.ID, secrets)))
	// Operation logs mask the same secret values, whatever field they sit in.
	app.Audit.SetSecrets(secrets)
	if role != "worker" {
		if app.Media.ModelIcons != nil {
			go syncBuiltinIcons(ctx, app.Media.ModelIcons, "models")
		}
		if app.Media.BrandIcons != nil {
			go syncBuiltinIcons(ctx, app.Media.BrandIcons, "project")
		}
	}
	go app.RunLogRetention(ctx, envDays("LOG_RETENTION_DAYS", 180), envDays("LOG_READ_RETENTION_DAYS", 14))
	go metrics.Run(ctx)
	go payments.Reconcile(ctx, app.Store, app.Pay, app.Billing)
	go app.Virtual.Run(ctx)
}

func syncBuiltinIcons(ctx context.Context, icons *media.BuiltinIcons, kind string) {
	for ctx.Err() == nil {
		attempt, cancel := context.WithTimeout(ctx, 2*time.Minute)
		count, err := icons.Sync(attempt)
		cancel()
		if err == nil {
			slog.Info("built-in icons synchronized to OSS", "kind", kind, "count", count)
			return
		}
		// SDK errors can contain request URLs; keep credentials out of logs.
		slog.Warn("built-in icons OSS sync incomplete; retaining local fallback", "kind", kind, "count", count)
		timer := time.NewTimer(time.Minute)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}
