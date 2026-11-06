package virtualpay

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"doubo/server/internal/core"
	"doubo/server/internal/wechat"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type Client struct {
	Config  Config
	HTTP    wechat.HTTPClient
	mu      sync.Mutex
	token   string
	expires time.Time
}

func New(c Config) (*Client, error) {
	if e := c.Validate(); e != nil {
		return nil, e
	}
	return &Client{Config: c, HTTP: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (c *Client) Ready() bool { return c != nil && (c.Config.Configured(0) || c.Config.Configured(1)) }
func (c *Client) Enabled() bool {
	return c.Ready() && c.Config.Enabled && c.Config.Configured(c.Config.Env) && len(c.Config.Products) > 0
}
func MAC(key, message string) string {
	h := hmac.New(sha256.New, []byte(key))
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

type Params struct {
	Channel   string `json:"channel"`
	Mode      string `json:"mode"`
	SignData  string `json:"signData"`
	PaySig    string `json:"paySig"`
	Signature string `json:"signature"`
}

func (c *Client) Parameters(id string, o core.Order, sessionKey string) (Params, error) {
	if c == nil || o.Virtual == nil || !c.Config.Configured(o.Virtual.Env) || o.AppID != c.Config.AppID || o.MerchantID != c.Config.OfferID || sessionKey == "" {
		return Params{}, fmt.Errorf("虚拟支付配置或订单信息不匹配")
	}
	data := string(core.Data(map[string]any{"offerId": o.MerchantID, "buyQuantity": 1, "env": o.Virtual.Env, "currencyType": "CNY", "productId": o.Virtual.ProductID, "goodsPrice": o.AmountFen, "outTradeNo": id, "attach": id}))
	return Params{Channel: Channel, Mode: "short_series_goods", SignData: data, PaySig: MAC(c.Config.Key(o.Virtual.Env), "requestVirtualPayment&"+data), Signature: MAC(sessionKey, data)}, nil
}
func (c *Client) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && c.expires.After(time.Now().Add(time.Minute)) {
		return c.token, nil
	}
	body := core.Data(map[string]any{"grant_type": "client_credential", "appid": c.Config.AppID, "secret": c.Config.AppSecret, "force_refresh": false})
	raw, e := c.post(ctx, "https://api.weixin.qq.com/cgi-bin/stable_token", body)
	if e != nil {
		return "", e
	}
	var v struct {
		Token   string `json:"access_token"`
		Expires int    `json:"expires_in"`
	}
	if json.Unmarshal(raw, &v) != nil || v.Token == "" || v.Expires < 60 {
		return "", fmt.Errorf("虚拟支付访问凭证不可用")
	}
	c.token = v.Token
	c.expires = time.Now().Add(time.Duration(v.Expires) * time.Second)
	return v.Token, nil
}
func (c *Client) call(ctx context.Context, endpoint string, env int, body any, out any) error {
	if c == nil || !c.Config.Configured(env) {
		return fmt.Errorf("虚拟支付尚未配置")
	}
	token, e := c.accessToken(ctx)
	if e != nil {
		return e
	}
	raw := core.Data(body)
	q := url.Values{"access_token": {token}, "pay_sig": {MAC(c.Config.Key(env), endpoint+"&"+string(raw))}}
	data, e := c.post(ctx, "https://api.weixin.qq.com"+endpoint+"?"+q.Encode(), raw)
	if e != nil {
		return e
	}
	if out != nil && json.Unmarshal(data, out) != nil {
		return fmt.Errorf("虚拟支付响应格式异常")
	}
	return nil
}
func (c *Client) post(ctx context.Context, address string, body []byte) ([]byte, error) {
	req, e := http.NewRequestWithContext(ctx, "POST", address, bytes.NewReader(body))
	if e != nil {
		return nil, fmt.Errorf("虚拟支付请求失败")
	}
	req.Header.Set("Content-Type", "application/json")
	res, e := c.HTTP.Do(req)
	if e != nil {
		return nil, fmt.Errorf("虚拟支付服务暂不可用")
	}
	defer res.Body.Close()
	raw, e := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if e != nil || res.StatusCode != 200 {
		return nil, fmt.Errorf("虚拟支付服务暂不可用")
	}
	var v struct {
		Code int `json:"errcode"`
	}
	if len(raw) == 0 {
		return raw, nil
	}
	if json.Unmarshal(raw, &v) != nil {
		return nil, fmt.Errorf("虚拟支付响应格式异常")
	}
	if v.Code != 0 {
		return nil, fmt.Errorf("虚拟支付请求未确认，错误码 %d", v.Code)
	}
	return raw, nil
}
