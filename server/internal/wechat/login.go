// Package wechat exchanges a short-lived wx.login code on the server only.
package wechat

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var (
	ErrNotConfigured = errors.New("微信登录尚未配置，请联系管理员")
	ErrInvalidCode   = errors.New("微信登录凭证已失效，请重新登录")
	ErrUnavailable   = errors.New("微信登录暂时不可用，请稍后重试")
	ErrRateLimited   = errors.New("微信登录过于频繁，请稍后重试")
	ErrRejected      = errors.New("微信暂时无法完成此次登录")
)

type HTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}
type Client struct {
	AppID  string
	Secret string
	HTTP   HTTPClient
}

func New(appID, secret string) *Client {
	return &Client{AppID: appID, Secret: secret, HTTP: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

type Session struct {
	OpenID string `json:"-"`
	Key    string `json:"-"`
}

func (c *Client) Exchange(ctx context.Context, code string) (string, error) {
	session, err := c.ExchangeSession(ctx, code)
	return session.OpenID, err
}
func (c *Client) ExchangeSession(ctx context.Context, code string) (Session, error) {
	if c == nil || c.AppID == "" || c.Secret == "" {
		return Session{}, ErrNotConfigured
	}
	if strings.TrimSpace(code) == "" || len(code) > 256 {
		return Session{}, ErrInvalidCode
	}
	q := url.Values{"appid": {c.AppID}, "secret": {c.Secret}, "js_code": {code}, "grant_type": {"authorization_code"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.weixin.qq.com/sns/jscode2session?"+q.Encode(), nil)
	if err != nil {
		return Session{}, ErrUnavailable
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return Session{}, ErrUnavailable
	} // Transport errors can contain the secret-bearing URL. Never return/log them.
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Session{}, ErrUnavailable
	}
	var data struct {
		OpenID     string `json:"openid"`
		SessionKey string `json:"session_key"`
		Error      int    `json:"errcode"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&data) != nil {
		return Session{}, ErrUnavailable
	}
	switch data.Error {
	case 0:
	case 40029, 40163:
		return Session{}, ErrInvalidCode
	case 45011:
		return Session{}, ErrRateLimited
	case 40226:
		return Session{}, ErrRejected
	case 40013, 40125, 40164:
		return Session{}, ErrNotConfigured
	default:
		return Session{}, ErrUnavailable
	}
	if data.OpenID == "" || len(data.OpenID) > 128 {
		return Session{}, ErrUnavailable
	}
	// session_key/unionid are deliberately not sent to clients or used as tokens.
	return Session{OpenID: data.OpenID, Key: data.SessionKey}, nil
}
