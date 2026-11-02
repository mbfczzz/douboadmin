package main

import (
	"context"
	"doubo/server/internal/api"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/mixing"
	"doubo/server/internal/payments"
	"doubo/server/internal/provider"
	"doubo/server/internal/speech"
	"os"
	"path/filepath"
)

func integrations(ctx context.Context, app *api.Server) (provider.Provider, error) {
	p, err := payments.New(ctx, payments.Config{AppID: app.Config.WeChatAppID, MerchantID: os.Getenv("WECHAT_PAY_MCH_ID"), CertificateSerial: os.Getenv("WECHAT_PAY_CERT_SERIAL"), APIv3Key: os.Getenv("WECHAT_PAY_API_V3_KEY"), PrivateKeyPath: os.Getenv("WECHAT_PAY_PRIVATE_KEY_PATH"), PublicKeyPath: os.Getenv("WECHAT_PAY_PUBLIC_KEY_PATH"), PublicKeyID: os.Getenv("WECHAT_PAY_PUBLIC_KEY_ID"), NotifyURL: os.Getenv("WECHAT_PAY_NOTIFY_URL"), RefundNotifyURL: os.Getenv("WECHAT_PAY_REFUND_NOTIFY_URL"), IOSAllowed: env("WECHAT_PAY_IOS_ALLOWED", "false") == "true"})
	if err != nil {
		return nil, err
	}
	app.Pay = p
	ai := &provider.Relay{Client: app.Relay, Store: app.Store, Assets: app.Media.Inputs, SaveResult: app.Media.Save}
	app.Mix = &mixing.Engine{Runner: mixing.Runner{FFmpeg: env("FFMPEG_PATH", "ffmpeg"), FFprobe: env("FFPROBE_PATH", "ffprobe")}, Store: app.Store, Media: app.Media, AI: ai, ASR: &speech.Client{BaseURL: os.Getenv("ASR_BASE_URL"), Key: os.Getenv("ASR_API_KEY"), Model: os.Getenv("ASR_MODEL")}, WorkDir: env("MIX_WORK_DIR", filepath.Join(os.TempDir(), "doubo-mix"))}
	app.Hot = &hotvideo.Service{Client: &hotvideo.Client{BaseURL: env("TIKHUB_BASE_URL", "https://api.tikhub.io"), Key: os.Getenv("TIKHUB_API_KEY")}, Store: app.Store}
	return provider.Router{AI: ai, Mix: app.Mix, Import: hotvideo.Importer{Service: app.Hot, Media: app.Media}}, nil
}
