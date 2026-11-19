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
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL, Key string
	HTTP         *http.Client
}

func (c *Client) Ready() bool { return c != nil && c.BaseURL != "" && c.Key != "" }

// Usage is what the provider reports for one reply.
type Usage struct {
	Input  int `json:"prompt_tokens"`
	Output int `json:"completion_tokens"`
}

// Complete sends messages (OpenAI shape) and returns the reply text and usage.
func (c *Client) Complete(ctx context.Context, model string, messages []any, maxTokens int) (string, Usage, error) {
	body := map[string]any{"model": model, "messages": messages, "stream": false}
	if maxTokens > 0 {
		body["max_tokens"] = maxTokens
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
	data, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode != 200 {
		return "", Usage{}, upstream(res.StatusCode, data)
	}
	var reply struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage *Usage `json:"usage"`
	}
	if json.Unmarshal(data, &reply) != nil || len(reply.Choices) == 0 {
		return "", Usage{}, &Error{Message: "对话模型返回格式无效"}
	}
	text := strings.TrimSpace(reply.Choices[0].Message.Content)
	if text == "" {
		return "", Usage{}, &Error{Message: "对话模型没有返回内容，请换个说法重试"}
	}
	usage := Usage{}
	if reply.Usage != nil {
		usage = *reply.Usage
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
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(body, &reply)
	e := &Error{Status: status, Retry: status == 429 || status >= 500}
	switch {
	case status == 401 || status == 403:
		e.Message = "对话模型 API Key 无效或没有权限，请联系管理员"
	case status == 402:
		e.Message = "对话模型账户余额不足，请联系管理员"
	case status == 429:
		e.Message = "对话模型请求过于频繁，请稍后重试"
	case status >= 500:
		e.Message = "对话模型服务繁忙，请稍后重试"
	default:
		e.Message = "对话模型拒绝了请求"
		if m := strings.TrimSpace(reply.Error.Message); m != "" {
			if r := []rune(m); len(r) > 120 {
				m = string(r[:120])
			}
			e.Message += "：" + m
		}
	}
	return e
}
