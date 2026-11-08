package main

import (
	"doubo/server/internal/api"
	"doubo/server/internal/settings"
	"doubo/server/internal/virtualpay"
	"fmt"
)

func virtualPayment(app *api.Server, values settings.Values) error {
	channel := values.Get("PAYMENT_CHANNEL", "wechat_jsapi")
	if channel != "wechat_jsapi" && channel != virtualpay.Channel {
		return fmt.Errorf("支付通道配置无效")
	}
	cfg, e := values.Virtual()
	if e != nil {
		return e
	}
	cfg.AppID, cfg.AppSecret = app.Config.WeChatAppID, app.Config.WeChatSecret
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
