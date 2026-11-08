package main

import (
	"context"
	"doubo/server/internal/api"
	"doubo/server/internal/media"
	"doubo/server/internal/settings"
	"doubo/server/internal/store"
	"doubo/server/internal/worker"
	"fmt"
	"github.com/redis/go-redis/v9"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	production := env("APP_ENV", "development") == "production"
	storage := env("STORAGE_DRIVER", "mysql")
	demoLogin := env("ALLOW_DEMO_LOGIN", "false") == "true"
	if production && demoLogin {
		return fmt.Errorf("ALLOW_DEMO_LOGIN must be false in production")
	}
	password := env("ADMIN_PASSWORD", "doubo-demo-2026")
	if production && (storage != "mysql" || os.Getenv("REDIS_ADDR") == "" || len(password) < 16 || password == "doubo-demo-2026") {
		return fmt.Errorf("production requires MySQL, Redis and an ADMIN_PASSWORD of at least 16 characters")
	}
	var s store.Store
	var err error
	switch storage {
	case "memory":
		s = store.NewMemory()
	case "mysql":
		s, err = store.NewMySQL(os.Getenv("MYSQL_DSN"))
	default:
		return fmt.Errorf("unknown STORAGE_DRIVER")
	}
	if err != nil {
		return err
	}
	defer s.Close()
	check, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err = s.Ping(check); err != nil {
		return err
	}
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	switch command {
	case "serve", "migrate", "worker":
	default:
		return fmt.Errorf("unknown command %q", command)
	}
	if command == "worker" && storage == "memory" {
		return fmt.Errorf("standalone worker requires shared MySQL storage")
	}
	if command == "migrate" {
		m, ok := s.(*store.MySQL)
		if !ok {
			return fmt.Errorf("migrate requires mysql")
		}
		return m.Migrate(check)
	}
	var rc *redis.Client
	redisOptions, err := redisOptionsFromEnv()
	if err != nil {
		return err
	}
	if redisOptions != nil {
		rc = redis.NewClient(redisOptions)
		defer rc.Close()
		if err = rc.Ping(check).Err(); err != nil {
			return err
		}
	}
	mediaDir := env("MEDIA_DIR", "../media")
	keyFile, err := filepath.Abs(env("INTEGRATION_SETTINGS_KEY_FILE", filepath.Join(mediaDir, ".secrets", "integrations.key")))
	if err != nil {
		return fmt.Errorf("无法确定接入配置加密密钥路径")
	}
	connections := settings.New(s, keyFile, settings.Environment())
	values, err := connections.LoadStartup(ctx)
	if err != nil {
		return err
	}
	cfg := api.Config{Production: production, DemoLogin: demoLogin, Storage: storage,
		AdminUser: env("ADMIN_USER", "admin"), AdminPassword: password, MediaDir: mediaDir,
		WebOrigin: values["WEB_ORIGIN"], WeChatAppID: values["WECHAT_APP_ID"], WeChatSecret: values["WECHAT_APP_SECRET"],
		RelayURL: values["RELAY_BASE_URL"], RelayKey: values["RELAY_API_KEY"]}
	cfg.RequireActivation = true
	app := api.New(s, api.NewSessions(rc), cfg)
	app.Integrations = connections
	app.Config.PublicBaseURL = values["PUBLIC_BASE_URL"]
	app.Config.CompletionTemplateID = values["WECHAT_COMPLETION_TEMPLATE_ID"]
	app.Media = &media.Service{Store: s, Objects: app.Objects, Dir: cfg.MediaDir}
	generator, err := integrations(ctx, app, values)
	if err != nil {
		return err
	}
	background(ctx, app, command, values)
	if env("RUN_WORKER", "true") == "true" || command == "worker" {
		if production && app.Objects == nil {
			slog.Warn("尚未配置 OSS，暂不领取生成任务；在后台保存配置并重启 API 和 Worker")
		} else {
			for range 2 {
				go worker.Run(ctx, s, generator)
			}
		}
	}
	if command == "worker" {
		<-ctx.Done()
		return nil
	}
	addr := env("HTTP_ADDR", "127.0.0.1:5173")
	if production && strings.HasPrefix(addr, "127.") {
		slog.Info("API bound to loopback; use reverse proxy")
	}
	srv := &http.Server{Addr: addr, Handler: app.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 90 * time.Second, WriteTimeout: 90 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		_ = srv.Shutdown(shutdown)
	}()
	slog.Info("Doubo API started", "addr", addr, "storage", storage, "provider", "relay")
	err = srv.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}
func main() {
	if err := run(); err != nil {
		slog.Error("startup failed", "error", err)
		os.Exit(1)
	}
}
