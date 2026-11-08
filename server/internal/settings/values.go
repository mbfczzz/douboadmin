package settings

import (
	"doubo/server/internal/virtualpay"
	"os"
	"strconv"
)

type Values map[string]string

func Environment() Values {
	v := Values{}
	for _, g := range definitions {
		for _, f := range g.Fields {
			v[f.Key] = f.Default
			if value := os.Getenv(f.Key); value != "" {
				v[f.Key] = value
			}
		}
	}
	return v
}

func (v Values) Get(key, fallback string) string {
	if value, ok := v[key]; ok {
		return value
	}
	return fallback
}

func (v Values) Secrets() []string {
	var out []string
	for _, g := range definitions {
		for _, f := range g.Fields {
			if f.Kind == "secret" && v[f.Key] != "" {
				out = append(out, v[f.Key])
			}
		}
	}
	return out
}

func (v Values) Virtual() (virtualpay.Config, error) {
	environment, err := strconv.Atoi(v.Get("WECHAT_VIRTUAL_ENV", "1"))
	if err != nil {
		return virtualpay.Config{}, invalid("WECHAT_VIRTUAL_ENV", "请选择有效的支付环境")
	}
	products, err := virtualpay.ParseProducts(v["WECHAT_VIRTUAL_PRODUCTS"])
	if err != nil {
		return virtualpay.Config{}, invalid("WECHAT_VIRTUAL_PRODUCTS", "积分套餐配置格式无效")
	}
	return virtualpay.Config{AppID: v["WECHAT_APP_ID"], AppSecret: v["WECHAT_APP_SECRET"],
		OfferID: v["WECHAT_VIRTUAL_OFFER_ID"], AppKey: v["WECHAT_VIRTUAL_APP_KEY"],
		SandboxAppKey: v["WECHAT_VIRTUAL_SANDBOX_APP_KEY"], Token: v["WECHAT_VIRTUAL_TOKEN"],
		EncodingAESKey: v["WECHAT_VIRTUAL_ENCODING_AES_KEY"], Enabled: v["WECHAT_VIRTUAL_ENABLED"] == "true",
		IOSAllowed: v["WECHAT_VIRTUAL_IOS_ALLOWED"] == "true", Env: environment, Products: products,
		CustomProductID: v["WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID"]}, nil
}
