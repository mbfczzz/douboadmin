package payments

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	wx "github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

type Config struct {
	AppID, MerchantID, CertificateSerial, APIv3Key string
	PrivateKeyPath, PublicKeyPath, PublicKeyID     string
	NotifyURL, RefundNotifyURL                     string
	IOSAllowed                                     bool
}
type Client struct {
	Config Config
	api    *wx.Client
	notify *notify.Handler
}

func New(ctx context.Context, c Config) (*Client, error) {
	p := &Client{Config: c}
	if c.MerchantID == "" && c.PrivateKeyPath == "" && c.APIv3Key == "" {
		return p, nil
	}
	if c.AppID == "" || c.MerchantID == "" || c.CertificateSerial == "" || len(c.APIv3Key) != 32 || c.PublicKeyID == "" {
		return nil, fmt.Errorf("微信支付配置不完整")
	}
	for _, address := range []string{c.NotifyURL, c.RefundNotifyURL} {
		u, e := url.Parse(address)
		if e != nil || u.Scheme != "https" || u.Hostname() == "" || u.RawQuery != "" || u.User != nil {
			return nil, fmt.Errorf("支付回调地址必须是无查询参数的 HTTPS 地址")
		}
	}
	privateKey, err := utils.LoadPrivateKeyWithPath(c.PrivateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("无法读取支付商户私钥")
	}
	publicKey, err := utils.LoadPublicKeyWithPath(c.PublicKeyPath)
	if err != nil {
		return nil, fmt.Errorf("无法读取微信支付公钥")
	}
	p.api, err = wx.NewClient(ctx, option.WithWechatPayPublicKeyAuthCipher(c.MerchantID, c.CertificateSerial, privateKey, c.PublicKeyID, publicKey), option.WithHTTPClient(&http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}))
	if err != nil {
		return nil, fmt.Errorf("支付客户端初始化失败")
	}
	p.notify, err = notify.NewRSANotifyHandler(c.APIv3Key, verifiers.NewSHA256WithRSAPubkeyVerifier(c.PublicKeyID, *publicKey))
	if err != nil {
		return nil, fmt.Errorf("支付通知校验器初始化失败")
	}
	return p, nil
}
func (p *Client) Ready() bool { return p != nil && p.api != nil && p.notify != nil }
func text(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
func number(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}
func serviceError() error {
	return fmt.Errorf("微信支付服务暂不可用，请稍后查询订单")
}
