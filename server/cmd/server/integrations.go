package main

import (
	"context"
	"doubo/server/internal/api"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/llm"
	"doubo/server/internal/media"
	"doubo/server/internal/objectstore"
	"doubo/server/internal/payments"
	"doubo/server/internal/provider"
	"doubo/server/internal/settings"
	"doubo/server/internal/sms"
	"doubo/server/internal/virtualpay"
	"doubo/server/internal/vision"
	"log/slog"
	"os"
	"path/filepath"
)

func integrations(ctx context.Context, app *api.Server, values settings.Values) (provider.Provider, error) {
	p, err := payments.New(ctx, payments.Config{AppID: app.Config.WeChatAppID, MerchantID: os.Getenv("WECHAT_PAY_MCH_ID"), CertificateSerial: os.Getenv("WECHAT_PAY_CERT_SERIAL"), APIv3Key: os.Getenv("WECHAT_PAY_API_V3_KEY"), PrivateKeyPath: os.Getenv("WECHAT_PAY_PRIVATE_KEY_PATH"), PublicKeyPath: os.Getenv("WECHAT_PAY_PUBLIC_KEY_PATH"), PublicKeyID: os.Getenv("WECHAT_PAY_PUBLIC_KEY_ID"), NotifyURL: os.Getenv("WECHAT_PAY_NOTIFY_URL"), RefundNotifyURL: os.Getenv("WECHAT_PAY_REFUND_NOTIFY_URL"), IOSAllowed: env("WECHAT_PAY_IOS_ALLOWED", "false") == "true"})
	if err != nil {
		slog.Warn("普通支付接入配置无效，支付未启用")
	}
	app.Pay = p
	app.Config.PaymentChannel = values.Get("PAYMENT_CHANNEL", "wechat_jsapi")
	if err = virtualPayment(app, values); err != nil {
		slog.Warn("虚拟支付接入配置无效，支付未启用")
		app.Virtual = &virtualpay.Service{Client: &virtualpay.Client{Config: virtualpay.Config{Env: 0}}, Store: app.Store, Billing: app.Billing}
	}
	if values["OSS_REGION"] != "" && values["OSS_BUCKET"] != "" && values["OSS_ACCESS_KEY_ID"] != "" && values["OSS_ACCESS_KEY_SECRET"] != "" {
		objects := objectstore.New(values["OSS_REGION"], values["OSS_BUCKET"], values["OSS_ACCESS_KEY_ID"], values["OSS_ACCESS_KEY_SECRET"])
		app.Objects = objects
		app.Media.Objects = objects
		app.Media.ModelIcons = media.NewModelIcons(filepath.Join(app.Media.Dir, "model-icons"), objects)
		app.Media.BrandIcons = media.NewBrandIcons(filepath.Join(app.Media.Dir, "brand"), objects)
		app.Media.UIArt = media.NewUIArt(filepath.Join(app.Media.Dir, "ui-art"), objects)
	}
	app.SMS = &sms.Aliyun{KeyID: values["SMS_ACCESS_KEY_ID"], Secret: values["SMS_ACCESS_KEY_SECRET"], SignName: values["SMS_SIGN_NAME"], Template: values["SMS_TEMPLATE_CODE"]}
	smsEnabled := values["SMS_VERIFICATION_ENABLED"] == "true"
	app.Config.SMSVerificationEnabled = &smsEnabled
	ai := &provider.Relay{Client: app.Relay, Store: app.Store, Assets: app.Media.Inputs, SaveResult: app.Media.Save}
	visionModel := values["VISION_MODEL"]
	if settings.IsMediaGenerationModel(visionModel) {
		slog.Warn("已忽略误配的视频生成接入点", "setting", "VISION_MODEL", "model", visionModel)
		visionModel = ""
	}
	app.Vision = &vision.Client{BaseURL: values["VISION_BASE_URL"], Key: values["VISION_API_KEY"], Model: visionModel}
	if err := settings.FileOnlyProblem(values); err != nil {
		slog.Warn("doubo.env 热门视频配置无效，已用默认值", "error", err)
	}
	feedWords, _ := settings.FeedKeywords(values["HOT_FEED_KEYWORDS"]) // bad values fall back to defaults
	app.Hot = &hotvideo.Service{Client: &hotvideo.Client{BaseURL: values["TIKHUB_BASE_URL"], Key: values["TIKHUB_API_KEY"]}, Store: app.Store, Redis: app.Sessions.Redis, Keywords: feedWords, Source: values["HOT_FEED_SOURCE"], TTL: hotCacheTTL(values)}
	return provider.Router{AI: ai, Import: hotvideo.Importer{Service: app.Hot, Media: app.Media, Vision: app.Vision}, Chat: chatModels(ctx, app, values)}, nil
}

// chatModels sets up DeepSeek / 豆包 (服务接入配置 → 对话模型) and lists their
// models in 模型管理. Default prices are the providers' list prices at
// 1 元 = 10 积分, per million tokens: DeepSeek Flash (2026-11) ¥1 input,
// ¥0.02 cache hit, ¥4 output off-peak and twice that at peak (V4 Pro ¥4.5 /
// ¥0.15 / ¥13.5; only Flash reads pictures); 豆包 Seed 2.1 lite ¥0.8 / ¥2.7
// (2026-11; its cache price is set by the operator). Operators set their
// own per model.
func chatModels(ctx context.Context, app *api.Server, values settings.Values) *provider.DirectChat {
	arkKey := values["CHAT_ARK_API_KEY"]
	if arkKey == "" {
		arkKey = values["VISION_API_KEY"]
	}
	deepseekModels, _ := settings.ChatModels(values.Get("CHAT_DEEPSEEK_MODELS", settings.DefaultDeepSeekModels))
	arkModels, arkErr := settings.ArkChatModels(values.Get("CHAT_ARK_MODELS", settings.DefaultArkChatModels))
	if arkErr != nil {
		slog.Warn("已忽略误配的豆包对话模型", "error", arkErr)
	}
	providers := []llm.Provider{
		{Name: "deepseek", Label: "DeepSeek", Client: &llm.Client{BaseURL: values.Get("CHAT_DEEPSEEK_BASE_URL", "https://api.deepseek.com"), Key: values["CHAT_DEEPSEEK_API_KEY"]}, Models: deepseekModels,
			InputPrice: 0.01, CachedPrice: ptr(0.0002), OutputPrice: 0.04, PeakRate: 2, Previous: [2]float64{0.02, 0.03},
			ModelPrices: map[string][3]float64{"deepseek-v4-pro": {0.045, 0.0015, 0.135}}, Seeing: []string{"flash"},
			Names:   map[string]string{"deepseek-flash": "DeepSeek", "deepseek-v4-pro": "DeepSeek Pro"},
			Tagline: map[string]string{"deepseek-flash": "反应快、价格低，写脚本方案首选", "deepseek-v4-pro": "推理更强，适合复杂策划"}},
		{Name: "ark", Label: "豆包", Client: &llm.Client{BaseURL: values.Get("CHAT_ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"), Key: arkKey}, Models: arkModels, InputPrice: 0.008, OutputPrice: 0.027, Previous: [2]float64{0.008, 0.02},
			Tagline: map[string]string{"": "字节豆包，看图细致，中文表达自然"}},
	}
	if err := llm.EnsureModels(ctx, app.Store, providers); err != nil {
		slog.Warn("对话模型登记失败", "error", err)
	}
	clients := map[string]*llm.Client{}
	for _, p := range providers {
		clients[p.Name] = p.Client
		app.ChatReady = app.ChatReady || p.Client.Ready()
		// Agent never sends the original video to the chat turn. The first Ark
		// chat model may instead be the cached video-understanding fallback.
		if p.Name == "ark" && p.Client.Ready() && len(p.Models) > 0 && app.Vision != nil {
			app.Vision.Fallback = &vision.Client{BaseURL: p.Client.BaseURL, Key: p.Client.Key, Model: p.Models[0]}
		}
	}
	return &provider.DirectChat{Clients: clients, Store: app.Store, Assets: app.Media.Inputs, Vision: app.Vision}
}

// hotCacheTTL reads the TikHub cache durations (doubo.env).
func hotCacheTTL(values settings.Values) hotvideo.CacheTTL {
	d := settings.HotCache(values)
	return hotvideo.CacheTTL{Feed: d["HOT_CACHE_FEED_MINUTES"], Search: d["HOT_CACHE_SEARCH_MINUTES"], Words: d["HOT_CACHE_WORDS_MINUTES"], Video: d["HOT_CACHE_VIDEO_MINUTES"]}
}

func ptr(v float64) *float64 { return &v }
