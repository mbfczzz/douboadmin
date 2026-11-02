package main

import (
	"context"
	"doubo/server/internal/api"
	"doubo/server/internal/media"
	"doubo/server/internal/objectstore"
	"doubo/server/internal/store"
	"doubo/server/internal/worker"
	"fmt"
	"github.com/redis/go-redis/v9"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
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
	if production && (command == "serve" || command == "worker") {
		for _, key := range []string{"WECHAT_APP_ID", "WECHAT_APP_SECRET", "OSS_BUCKET", "OSS_REGION", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"} {
			if os.Getenv(key) == "" {
				return fmt.Errorf("production API requires %s", key)
			}
		}
	}
	var rc *redis.Client
	if addr := os.Getenv("REDIS_ADDR"); addr != "" {
		rc = redis.NewClient(&redis.Options{Addr: addr, Password: os.Getenv("REDIS_PASSWORD")})
		defer rc.Close()
		if err = rc.Ping(check).Err(); err != nil {
			return err
		}
	}
	cfg := api.Config{Production: production, DemoLogin: demoLogin, Storage: storage, AdminUser: env("ADMIN_USER", "admin"), AdminPassword: password, MediaDir: env("MEDIA_DIR", "../media"), WebOrigin: env("WEB_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173"), WeChatAppID: os.Getenv("WECHAT_APP_ID"), WeChatSecret: os.Getenv("WECHAT_APP_SECRET"), RelayURL: env("RELAY_BASE_URL", "https://relay.tcmzhan.com"), RelayKey: os.Getenv("RELAY_API_KEY")}
	cfg.RequireActivation = true
	app := api.New(s, api.NewSessions(rc), cfg)
	app.Config.PublicBaseURL = os.Getenv("PUBLIC_BASE_URL")
	app.Config.CompletionTemplateID = os.Getenv("WECHAT_COMPLETION_TEMPLATE_ID")
	if bucket := os.Getenv("OSS_BUCKET"); bucket != "" {
		if os.Getenv("OSS_REGION") == "" || os.Getenv("OSS_ACCESS_KEY_ID") == "" || os.Getenv("OSS_ACCESS_KEY_SECRET") == "" {
			return fmt.Errorf("OSS region and credentials are required")
		}
		app.Objects = objectstore.New(os.Getenv("OSS_REGION"), bucket, os.Getenv("OSS_ACCESS_KEY_ID"), os.Getenv("OSS_ACCESS_KEY_SECRET"))
	}
	app.Media = &media.Service{Store: s, Objects: app.Objects, Dir: cfg.MediaDir}
	generator, err := integrations(ctx, app)
	if err != nil {
		return err
	}
	background(ctx, app, command)
	if env("RUN_WORKER", "true") == "true" || command == "worker" {
		for range 2 {
			go worker.Run(ctx, s, generator)
		}
	}
	if command == "worker" {
		<-ctx.Done()
		return nil
	}
	addr := env("HTTP_ADDR", "127.0.0.1:8080")
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
