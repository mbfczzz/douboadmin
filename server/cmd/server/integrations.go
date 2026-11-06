package main

import (
	"context"
	"doubo/server/internal/api"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/payments"
	"doubo/server/internal/provider"
	"os"
)

func integrations(ctx context.Context, app *api.Server) (provider.Provider, error) {
	p, err := payments.New(ctx, payments.Config{AppID: app.Config.WeChatAppID, MerchantID: os.Getenv("WECHAT_PAY_MCH_ID"), CertificateSerial: os.Getenv("WECHAT_PAY_CERT_SERIAL"), APIv3Key: os.Getenv("WECHAT_PAY_API_V3_KEY"), PrivateKeyPath: os.Getenv("WECHAT_PAY_PRIVATE_KEY_PATH"), PublicKeyPath: os.Getenv("WECHAT_PAY_PUBLIC_KEY_PATH"), PublicKeyID: os.Getenv("WECHAT_PAY_PUBLIC_KEY_ID"), NotifyURL: os.Getenv("WECHAT_PAY_NOTIFY_URL"), RefundNotifyURL: os.Getenv("WECHAT_PAY_REFUND_NOTIFY_URL"), IOSAllowed: env("WECHAT_PAY_IOS_ALLOWED", "false") == "true"})
	if err != nil {
		return nil, err
	}
	app.Pay = p
	if err = virtualPayment(app); err != nil {
		return nil, err
	}
	ai := &provider.Relay{Client: app.Relay, Store: app.Store, Assets: app.Media.Inputs, SaveResult: app.Media.Save}
	app.Hot = &hotvideo.Service{Client: &hotvideo.Client{BaseURL: env("TIKHUB_BASE_URL", "https://api.tikhub.io"), Key: os.Getenv("TIKHUB_API_KEY")}, Store: app.Store}
	return provider.Router{AI: ai, Import: hotvideo.Importer{Service: app.Hot, Media: app.Media}}, nil
}
