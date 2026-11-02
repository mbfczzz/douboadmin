// Package relay implements only documented relay operations; no fallback generators.
package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	Base, Key string
	HTTP      *http.Client
}

func New(base, key string) *Client {
	return &Client{Base: strings.TrimRight(base, "/"), Key: strings.TrimSpace(key), HTTP: &http.Client{
		Timeout:       120 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}
func (c *Client) Ready() bool { return c != nil && c.Key != "" && c.Base != "" }

// HTTPError is a definite upstream rejection. A transport error may have accepted the task.
type HTTPError struct {
	Status  int
	Message string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("中转服务 HTTP %d：%s", e.Status, e.Message)
}

func (c *Client) Do(ctx context.Context, method, path string, body any) ([]byte, error) {
	if !c.Ready() {
		return nil, fmt.Errorf("中转服务尚未配置")
	}
	var b []byte
	var err error
	if body != nil {
		b, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.Base+path, bytes.NewReader(b))
	if err != nil {
		return nil, fmt.Errorf("中转服务地址无效")
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("中转服务连接中断，请稍后核实任务状态")
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, (16<<20)+1))
	if err != nil || len(raw) > 16<<20 {
		return nil, fmt.Errorf("中转服务响应不完整")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var v struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &v)
		msg := strings.ReplaceAll(v.Error.Message, c.Key, "[redacted]")
		if msg == "" {
			msg = "请求未完成，请检查模型配置或账户额度"
		}
		runes := []rune(msg)
		if len(runes) > 200 {
			msg = string(runes[:200])
		}
		return nil, &HTTPError{resp.StatusCode, msg}
	}
	return raw, nil
}

func (c *Client) Poll(ctx context.Context, id string) ([]byte, error) {
	return c.Do(ctx, http.MethodGet, "/v1/tasks/"+url.PathEscape(id), nil)
}
