package main

import (
	"doubo/server/internal/api"
	"testing"
)

func emptyVirtualEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{"PAYMENT_CHANNEL", "WECHAT_VIRTUAL_ENABLED", "WECHAT_VIRTUAL_ENV", "WECHAT_VIRTUAL_OFFER_ID", "WECHAT_VIRTUAL_APP_KEY", "WECHAT_VIRTUAL_SANDBOX_APP_KEY", "WECHAT_VIRTUAL_TOKEN", "WECHAT_VIRTUAL_ENCODING_AES_KEY", "WECHAT_VIRTUAL_IOS_ALLOWED", "WECHAT_VIRTUAL_PRODUCTS", "WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID"} {
		t.Setenv(key, "")
	}
}
func TestBlankVirtualConfigurationDoesNotEnablePayment(t *testing.T) {
	emptyVirtualEnv(t)
	app := &api.Server{}
	if e := virtualPayment(app); e != nil {
		t.Fatal(e)
	}
	if app.Virtual.Enabled() || app.Virtual.Ready() || app.Config.PaymentChannel != "wechat_jsapi" {
		t.Fatal("blank config activated payments")
	}
}
func TestProductionRejectsSandboxCredentialsEvenWhenPurchasesAreDisabled(t *testing.T) {
	emptyVirtualEnv(t)
	t.Setenv("WECHAT_VIRTUAL_SANDBOX_APP_KEY", "fixture-sandbox-key")
	app := &api.Server{Config: api.Config{Production: true}}
	if e := virtualPayment(app); e == nil {
		t.Fatal("production sandbox key accepted")
	}
}
