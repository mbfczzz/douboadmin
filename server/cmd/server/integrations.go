package main

import (
	"context"
	"doubo/server/internal/api"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/objectstore"
	"doubo/server/internal/payments"
	"doubo/server/internal/provider"
	"doubo/server/internal/settings"
	"doubo/server/internal/sms"
	"doubo/server/internal/virtualpay"
	"log/slog"
	"os"
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
		app.Objects = objectstore.New(values["OSS_REGION"], values["OSS_BUCKET"], values["OSS_ACCESS_KEY_ID"], values["OSS_ACCESS_KEY_SECRET"])
		app.Media.Objects = app.Objects
	}
	app.SMS = &sms.Aliyun{KeyID: values["SMS_ACCESS_KEY_ID"], Secret: values["SMS_ACCESS_KEY_SECRET"], SignName: values["SMS_SIGN_NAME"], Template: values["SMS_TEMPLATE_CODE"]}
	ai := &provider.Relay{Client: app.Relay, Store: app.Store, Assets: app.Media.Inputs, SaveResult: app.Media.Save}
	app.Hot = &hotvideo.Service{Client: &hotvideo.Client{BaseURL: values["TIKHUB_BASE_URL"], Key: values["TIKHUB_API_KEY"]}, Store: app.Store}
	return provider.Router{AI: ai, Import: hotvideo.Importer{Service: app.Hot, Media: app.Media}}, nil
}
