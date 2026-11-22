package api

import (
	"context"
	"doubo/server/internal/analytics"
	"doubo/server/internal/audit"
	"doubo/server/internal/billing"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/media"
	"doubo/server/internal/monitor"
	"doubo/server/internal/partners"
	"doubo/server/internal/payments"
	"doubo/server/internal/relay"
	"doubo/server/internal/settings"
	"doubo/server/internal/store"
	"doubo/server/internal/virtualpay"
	"doubo/server/internal/vision"
	"doubo/server/internal/wechat"
	"io"
	"net/http"
)

type Config struct {
	// Nil retains the legacy automatic policy for embedded callers.
	SMSVerificationEnabled *bool
	PaymentChannel         string
	RequireActivation      bool
	Production             bool
	DemoLogin              bool
	Storage                string
	AdminUser              string
	AdminPassword          string
	MediaDir               string
	WebOrigin              string
	WeChatCodeVersion      string
	WeChatAppID            string
	WeChatSecret           string
	RelayURL               string
	RelayKey               string
	PublicBaseURL          string
	CompletionTemplateID   string
	CompletionReady        bool
}
type Objects interface {
	Put(context.Context, string, io.Reader, string) error
	URL(context.Context, string) (string, error)
}
type Server struct {
	Runtime      *monitor.Service
	Integrations *settings.Manager
	Partners     *partners.Service
	Activity     *analytics.Recorder
	Visits       *analytics.Visits
	Hot          *hotvideo.Service
	Vision       *vision.Client // 一键复刻's video breakdown (hot_breakdown.go)
	ChatReady    bool           // a DeepSeek or 豆包 API Key is set (服务接入配置 → 对话模型)
	Billing      *billing.Service
	Pay          *payments.Client
	Virtual      *virtualpay.Service
	Objects      Objects
	Relay        *relay.Client
	Media        *media.Service
	WeChat       *wechat.Client
	SMS          SMSSender
	Store        store.Store
	Sessions     *Sessions
	Config       Config
	Mux          *http.ServeMux
	// Audit queues operation logs; nil when the store cannot keep them.
	Audit      *audit.Writer
	statsCache auditStatsCache
	visitLimit visitLimit
	clickLimit visitLimit // 功能使用 taps (clicksPerMinute)
}
type ctxKey int

const identityKey ctxKey = 0

func New(s store.Store, sessions *Sessions, c Config) *Server {
	a := &Server{Store: s, Sessions: sessions, Config: c, Mux: http.NewServeMux(), WeChat: wechat.New(c.WeChatAppID, c.WeChatSecret)}
	a.Runtime = monitor.New(s, "serve", "")
	a.Relay = relay.New(c.RelayURL, c.RelayKey)
	a.Billing = &billing.Service{Store: s, RequireActivation: c.RequireActivation, BeforePayment: a.paymentAdmission}
	a.Partners = &partners.Service{Store: s}
	a.Activity = &analytics.Recorder{Store: s}
	a.Visits = &analytics.Visits{Store: s}
	a.clickLimit.max = clicksPerMinute
	if logs, ok := s.(store.AuditLogs); ok {
		a.Audit = audit.NewWriter(logs, a.auditName)
		a.Relay.Observe = a.modelLog
	}
	a.routes()
	return a
}
