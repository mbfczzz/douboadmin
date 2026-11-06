package main

import (
	"doubo/server/internal/api"
	"doubo/server/internal/virtualpay"
	"fmt"
	"os"
	"strconv"
)

func virtualPayment(app *api.Server) error {
	channel := env("PAYMENT_CHANNEL", "wechat_jsapi")
	if channel != "wechat_jsapi" && channel != virtualpay.Channel {
		return fmt.Errorf("支付通道配置无效")
	}
	environment, e := strconv.Atoi(env("WECHAT_VIRTUAL_ENV", "1"))
	if e != nil {
		return fmt.Errorf("虚拟支付环境配置无效")
	}
	products, e := virtualpay.ParseProducts(os.Getenv("WECHAT_VIRTUAL_PRODUCTS"))
	if e != nil {
		return e
	}
	cfg := virtualpay.Config{AppID: app.Config.WeChatAppID, AppSecret: app.Config.WeChatSecret, OfferID: os.Getenv("WECHAT_VIRTUAL_OFFER_ID"), AppKey: os.Getenv("WECHAT_VIRTUAL_APP_KEY"), SandboxAppKey: os.Getenv("WECHAT_VIRTUAL_SANDBOX_APP_KEY"), Token: os.Getenv("WECHAT_VIRTUAL_TOKEN"), EncodingAESKey: os.Getenv("WECHAT_VIRTUAL_ENCODING_AES_KEY"), Enabled: env("WECHAT_VIRTUAL_ENABLED", "false") == "true", IOSAllowed: env("WECHAT_VIRTUAL_IOS_ALLOWED", "false") == "true", Env: environment, Products: products}
	if app.Config.Production && ((cfg.Enabled && cfg.Env != 0) || cfg.SandboxAppKey != "") {
		return fmt.Errorf("生产环境不得启用虚拟支付沙箱")
	}
	client, e := virtualpay.New(cfg)
	if e != nil {
		return e
	}
	app.Virtual = &virtualpay.Service{Client: client, Store: app.Store, Billing: app.Billing}
	app.Config.PaymentChannel = channel
	return nil
}
