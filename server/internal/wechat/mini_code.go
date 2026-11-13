package wechat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"regexp"
)

var inviteCode = regexp.MustCompile(`^[A-HJ-NP-Z2-9]{8}$`)
var ErrMiniCode = errors.New("小程序码生成失败，请检查微信配置和目标版本")

// MiniCode targets the activation page; scene contains only the opaque invite.
func (c *Client) MiniCode(ctx context.Context, code, version string) ([]byte, error) {
	if c == nil || c.AppID == "" || c.Secret == "" {
		return nil, ErrNotConfigured
	}
	if !inviteCode.MatchString(code) || (version != "trial" && version != "release" && version != "develop") {
		return nil, ErrMiniCode
	}
	body, _ := json.Marshal(map[string]any{"scene": code, "page": "pages/activate/index", "env_version": version, "check_path": version == "release", "width": 430})
	for attempt := 0; attempt < 2; attempt++ {
		token, err := c.phoneAccessToken(ctx)
		if err != nil {
			return nil, ErrMiniCode
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token="+url.QueryEscape(token), bytes.NewReader(body))
		if err != nil {
			return nil, ErrMiniCode
		}
		req.Header.Set("Content-Type", "application/json")
		res, err := c.HTTP.Do(req)
		if err != nil {
			return nil, ErrMiniCode
		}
		data, readErr := io.ReadAll(io.LimitReader(res.Body, (2<<20)+1))
		res.Body.Close()
		if readErr != nil || res.StatusCode != 200 || len(data) > 2<<20 {
			return nil, ErrMiniCode
		}
		var failure struct {
			Code int `json:"errcode"`
		}
		if json.Unmarshal(data, &failure) == nil {
			if attempt == 0 && (failure.Code == 40001 || failure.Code == 42001) {
				c.phoneMu.Lock()
				if c.phoneToken == token {
					c.phoneToken = ""
				}
				c.phoneMu.Unlock()
				continue
			}
			return nil, ErrMiniCode
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || cfg.Width < 1 || cfg.Height < 1 || cfg.Width > 1280 || cfg.Height > 1280 {
			return nil, ErrMiniCode
		}
		img, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			return nil, ErrMiniCode
		}
		var result bytes.Buffer
		if png.Encode(&result, img) != nil {
			return nil, ErrMiniCode
		}
		return result.Bytes(), nil
	}
	return nil, ErrMiniCode
}
