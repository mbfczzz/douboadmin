package wechat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrPhoneAuthorization = errors.New("手机号授权未完成或已失效，请重新授权")

func (c *Client) phonePost(ctx context.Context, endpoint string, input, output any) error {
	body, err := json.Marshal(input)
	if err != nil {
		return ErrUnavailable
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return ErrUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return ErrUnavailable
	} // Never expose a URL containing access_token.
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(output) != nil {
		return ErrUnavailable
	}
	return nil
}

func (c *Client) phoneAccessToken(ctx context.Context) (string, error) {
	c.phoneMu.Lock()
	defer c.phoneMu.Unlock()
	if c.phoneToken != "" && time.Now().Before(c.phoneTokenUntil) {
		return c.phoneToken, nil
	}
	var out struct {
		Token   string `json:"access_token"`
		Expires int    `json:"expires_in"`
		Code    int    `json:"errcode"`
	}
	err := c.phonePost(ctx, "https://api.weixin.qq.com/cgi-bin/stable_token", map[string]any{
		"grant_type": "client_credential", "appid": c.AppID, "secret": c.Secret, "force_refresh": false,
	}, &out)
	if err != nil {
		return "", err
	}
	if out.Code != 0 || out.Token == "" || out.Expires <= 60 {
		return "", ErrNotConfigured
	}
	c.phoneToken, c.phoneTokenUntil = out.Token, time.Now().Add(time.Duration(out.Expires-60)*time.Second)
	return c.phoneToken, nil
}

// Phone exchanges getPhoneNumber's one-use code; it is NOT a wx.login code.
// Only the server's response is trusted, never a client-supplied phone number.
func (c *Client) Phone(ctx context.Context, code string) (string, error) {
	if c == nil || c.AppID == "" || c.Secret == "" {
		return "", ErrNotConfigured
	}
	if strings.TrimSpace(code) == "" || len(code) > 256 {
		return "", ErrPhoneAuthorization
	}
	for attempt := 0; attempt < 2; attempt++ {
		token, err := c.phoneAccessToken(ctx)
		if err != nil {
			return "", err
		}
		var out struct {
			Code int `json:"errcode"`
			Info struct {
				Number    string `json:"purePhoneNumber"`
				Country   string `json:"countryCode"`
				Watermark struct {
					AppID string `json:"appid"`
				} `json:"watermark"`
			} `json:"phone_info"`
		}
		err = c.phonePost(ctx, "https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token="+url.QueryEscape(token), map[string]string{"code": code}, &out)
		if err != nil {
			return "", err
		}
		if attempt == 0 && (out.Code == 40001 || out.Code == 42001) {
			c.phoneMu.Lock()
			if c.phoneToken == token {
				c.phoneToken = ""
			}
			c.phoneMu.Unlock()
			continue
		}
		if out.Code != 0 || out.Info.Watermark.AppID != c.AppID || out.Info.Country != "86" || len(out.Info.Number) != 11 {
			return "", ErrPhoneAuthorization
		}
		return out.Info.Number, nil
	}
	return "", ErrPhoneAuthorization
}
