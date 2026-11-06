// Package virtualpay implements WeChat virtual goods, separately from JSAPI V3.
package virtualpay

import (
	"doubo/server/internal/core"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

const Channel = "wechat_virtual"

type Product struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	AmountFen   int64  `json:"amountFen"`
	PointsUnits int64  `json:"pointsUnits"`
}
type Config struct {
	AppID, AppSecret, OfferID                    string
	AppKey, SandboxAppKey, Token, EncodingAESKey string
	Enabled, IOSAllowed                          bool
	Env                                          int
	Products                                     []Product
}

func ParseProducts(raw string) ([]Product, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var p []Product
	if json.Unmarshal([]byte(raw), &p) != nil {
		return nil, fmt.Errorf("虚拟支付商品配置不是有效 JSON")
	}
	return p, nil
}
func (c Config) Key(env int) string {
	if env == 0 {
		return c.AppKey
	}
	if env == 1 {
		return c.SandboxAppKey
	}
	return ""
}
func (c Config) Validate() error {
	if c.Env != 0 && c.Env != 1 {
		return fmt.Errorf("虚拟支付环境必须为 0 或 1")
	}
	if len(c.Products) > 100 {
		return fmt.Errorf("虚拟支付商品数量超过限制")
	}
	seen := map[string]bool{}
	for _, p := range c.Products {
		if p.ID == "" || len(p.ID) > 128 || strings.TrimSpace(p.Name) == "" || len([]rune(p.Name)) > 80 || seen[p.ID] || p.AmountFen < 1 || p.AmountFen > 10000000 || p.PointsUnits < 1 || p.PointsUnits > core.MaxBalance {
			return fmt.Errorf("虚拟支付商品 ID、名称、金额或积分无效")
		}
		seen[p.ID] = true
	}
	if c.EncodingAESKey != "" {
		k, e := base64.StdEncoding.DecodeString(c.EncodingAESKey + "=")
		if e != nil || len(k) != 32 {
			return fmt.Errorf("虚拟支付消息 AES 密钥无效")
		}
	}
	if c.Enabled && (!c.Configured(c.Env) || len(c.Products) == 0) {
		return fmt.Errorf("启用虚拟支付前必须配置凭证、消息安全模式和商品")
	}
	if c.IOSAllowed && c.Env != 0 {
		return fmt.Errorf("iOS 虚拟支付不支持沙箱")
	}
	return nil
}
func (c Config) Configured(env int) bool {
	return c.AppID != "" && c.AppSecret != "" && c.OfferID != "" && c.Key(env) != "" && c.Token != "" && len(c.EncodingAESKey) == 43
}
func (c Config) Product(id string) (Product, bool) {
	for _, p := range c.Products {
		if p.ID == id {
			return p, true
		}
	}
	return Product{}, false
}
