package wechat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"
)

// 内容安全 (security.msgSecCheck / security.mediaCheckAsync, version 2).
// Text is judged at once; an image or audio file is fetched by WeChat and
// judged later, the result coming by message push (event wxa_media_check).

// Scenes WeChat weighs the content for.
const (
	SceneProfile = 1 // 资料
	SceneComment = 2 // 评论
	SceneForum   = 3 // 论坛
	SceneSocial  = 4 // 社交日志
)

// Media types of mediaCheckAsync.
const (
	MediaAudio = 1
	MediaImage = 2
)

// Verdict: suggest is pass, review or risky; label 100 is normal.
type Verdict struct {
	Suggest string `json:"suggest" xml:"suggest"`
	Label   int    `json:"label" xml:"label"`
}

// SecCall is one call as sent and answered (no access token), for the log.
type SecCall struct {
	Path     string
	Request  any
	Response []byte
	Took     time.Duration
}

var ErrSecCheck = errors.New("内容安全接口调用失败")

// MsgSecCheck judges text sent by openid (who opened the mini-program in
// the last two hours).
func (c *Client) MsgSecCheck(ctx context.Context, openid string, scene int, content string) (Verdict, SecCall, error) {
	body := map[string]any{"version": 2, "openid": openid, "scene": scene, "content": content}
	var out struct {
		Code   int     `json:"errcode"`
		Result Verdict `json:"result"`
	}
	call, err := c.secPost(ctx, "/wxa/msg_sec_check", body, &out)
	if err == nil && (out.Code != 0 || out.Result.Suggest == "") {
		err = ErrSecCheck
	}
	return out.Result, call, err
}

// MediaCheckAsync asks WeChat to fetch and judge the file at mediaURL; the
// trace id comes back with the result.
func (c *Client) MediaCheckAsync(ctx context.Context, openid string, scene, mediaType int, mediaURL string) (string, SecCall, error) {
	body := map[string]any{"version": 2, "openid": openid, "scene": scene, "media_type": mediaType, "media_url": mediaURL}
	var out struct {
		Code  int    `json:"errcode"`
		Trace string `json:"trace_id"`
	}
	call, err := c.secPost(ctx, "/wxa/media_check_async", body, &out)
	if err == nil && (out.Code != 0 || out.Trace == "") {
		err = ErrSecCheck
	}
	return out.Trace, call, err
}

// secPost calls an access-token API, once more with a fresh token when the
// cached one has expired early.
func (c *Client) secPost(ctx context.Context, path string, input, output any) (SecCall, error) {
	call := SecCall{Path: path, Request: input}
	if c == nil || c.AppID == "" || c.Secret == "" {
		return call, ErrNotConfigured
	}
	raw, err := json.Marshal(input)
	if err != nil {
		return call, ErrSecCheck
	}
	start := time.Now()
	for attempt := 0; attempt < 2; attempt++ {
		token, err := c.phoneAccessToken(ctx)
		if err != nil {
			return call, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.weixin.qq.com"+path+"?access_token="+url.QueryEscape(token), bytes.NewReader(raw))
		if err != nil {
			return call, ErrSecCheck
		}
		req.Header.Set("Content-Type", "application/json")
		res, err := c.HTTP.Do(req)
		if err != nil {
			return call, ErrSecCheck // never the error itself: its URL holds the token
		}
		call.Response, _ = io.ReadAll(io.LimitReader(res.Body, 64<<10))
		res.Body.Close()
		call.Took = time.Since(start)
		var code struct {
			Code int `json:"errcode"`
		}
		if res.StatusCode != http.StatusOK || json.Unmarshal(call.Response, &code) != nil {
			return call, ErrSecCheck
		}
		if attempt == 0 && (code.Code == 40001 || code.Code == 42001) {
			c.phoneMu.Lock()
			if c.phoneToken == token {
				c.phoneToken = ""
			}
			c.phoneMu.Unlock()
			continue
		}
		return call, json.Unmarshal(call.Response, output)
	}
	return call, ErrSecCheck
}

// MediaResult is a wxa_media_check push (JSON or XML).
type MediaResult struct {
	Trace  string  `json:"trace_id" xml:"trace_id"`
	Code   int     `json:"errcode" xml:"errcode"`
	Result Verdict `json:"result" xml:"result"`
}
