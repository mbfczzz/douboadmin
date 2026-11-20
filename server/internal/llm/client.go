// Package llm calls chat models directly at their providers (DeepSeek, 火山方舟
// 豆包). Both speak the OpenAI chat-completions protocol and report the tokens
// used, which is what 按量（token）计费 settles on.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL, Key string
	HTTP         *http.Client
}

func (c *Client) Ready() bool { return c != nil && c.BaseURL != "" && c.Key != "" }

// Usage is what the provider reports for one reply. Cached is the part of
// Input read from the provider's cache, charged at the cache price.
type Usage struct {
	Input, Output, Cached int
}

// DeepSeek reports prompt_cache_hit_tokens; 方舟 (OpenAI style) reports
// prompt_tokens_details.cached_tokens.
func (u *Usage) UnmarshalJSON(b []byte) error {
	var v struct {
		Input   int `json:"prompt_tokens"`
		Output  int `json:"completion_tokens"`
		Hit     int `json:"prompt_cache_hit_tokens"`
		Details *struct {
			Cached int `json:"cached_tokens"`
		} `json:"prompt_tokens_details"`
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	*u = Usage{Input: v.Input, Output: v.Output, Cached: v.Hit}
	if v.Details != nil && v.Details.Cached > u.Cached {
		u.Cached = v.Details.Cached
	}
	return nil
}

// Complete sends messages (OpenAI shape) and returns the reply text and usage.
// The reply is streamed: onText (when set) gets the text so far as it grows,
// and an error from it stops the reply.
func (c *Client) Complete(ctx context.Context, model string, messages []any, maxTokens int, onText func(string) error) (string, Usage, error) {
	body := map[string]any{"model": model, "messages": messages, "stream": true,
		"stream_options": map[string]bool{"include_usage": true}}
	if maxTokens > 0 {
		body["max_tokens"] = maxTokens
	}
	// 豆包 Seed models think before answering by default, which adds tens of
	// seconds; writing a creative plan does not need it. (Endpoint IDs
	// "ep-…" are left as configured in 方舟.)
	if strings.HasPrefix(model, "doubao-seed") {
		body["thinking"] = map[string]string{"type": "disabled"}
	}
	raw, _ := json.Marshal(body)
	r, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(c.BaseURL, "/")+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", Usage{}, fmt.Errorf("对话模型接口地址无效")
	}
	r.Header.Set("Authorization", "Bearer "+c.Key)
	r.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 3 * time.Minute}
	}
	res, err := client.Do(r)
	if err != nil {
		return "", Usage{}, &Error{Message: "对话模型连接失败，请稍后重试", Retry: true}
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return "", Usage{}, upstream(res.StatusCode, data)
	}
	var text string
	var usage Usage
	if strings.HasPrefix(res.Header.Get("Content-Type"), "text/event-stream") {
		text, usage, err = readStream(res.Body, onText)
	} else { // a provider that ignored "stream" answers in one piece
		text, usage, err = readWhole(res.Body)
	}
	if err != nil {
		return "", Usage{}, err
	}
	if text = strings.TrimSpace(text); text == "" {
		return "", Usage{}, &Error{Message: "对话模型没有返回内容，请换个说法重试"}
	}
	return text, usage, nil
}

// Error is safe to show users; Retry marks failures worth trying again
// (network, rate limit, provider overload).
type Error struct {
	Message string
	Status  int
	Retry   bool
}

func (e *Error) Error() string { return e.Message }

func upstream(status int, body []byte) error {
	var reply struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(body, &reply)
	e := &Error{Status: status, Retry: status == 429 || status >= 500}
	// Users get Chinese; the provider's own words go to the log for the operator.
	slog.Warn("chat model request failed", "status", status, "code", reply.Error.Code, "message", reply.Error.Message)
	lower := strings.ToLower(reply.Error.Code + " " + reply.Error.Message)
	switch {
	case strings.Contains(lower, "not activated") || strings.Contains(lower, "modelnotopen"):
		e.Message = "该对话模型还没有在服务商处开通，请联系管理员开通或换一个模型"
	case strings.Contains(lower, "model") && (strings.Contains(lower, "not found") || strings.Contains(lower, "not exist") || strings.Contains(lower, "does not exist")):
		e.Message = "对话模型不存在，请联系管理员检查模型 ID"
	case strings.Contains(lower, "content") && (strings.Contains(lower, "sensitive") || strings.Contains(lower, "risk") || strings.Contains(lower, "inspection")):
		e.Message = "内容未通过安全审核，请换个说法再试"
	case status == 401 || status == 403:
		e.Message = "对话模型 API Key 无效或没有权限，请联系管理员"
	case status == 402:
		e.Message = "对话模型账户余额不足，请联系管理员"
	case status == 429:
		e.Message = "对话模型请求过于频繁，请稍后重试"
	case status >= 500:
		e.Message = "对话模型服务繁忙，请稍后重试"
	default:
		e.Message = "对话模型暂时无法处理这次请求，请稍后重试；多次失败请联系管理员"
	}
	return e
}
