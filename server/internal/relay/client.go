// Package relay implements only documented relay operations; no fallback generators.
package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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
	// Timeout bounds a call whose context has no deadline. Workers pass the
	// job's own deadline instead: synchronous image generation can take minutes,
	// and hanging up early leaves a task the relay finishes but we never see.
	Timeout time.Duration
	// Observe, when set, is told about every upstream call (for the model
	// call log). It runs on the caller's goroutine and must be quick.
	Observe func(context.Context, Call)
}

func New(base, key string) *Client {
	return &Client{Base: strings.TrimRight(base, "/"), Key: strings.TrimSpace(key), Timeout: 120 * time.Second, HTTP: &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}
func (c *Client) Ready() bool { return c != nil && c.Key != "" && c.Base != "" }

// HTTPError is a definite upstream rejection. A transport error may have accepted the task.
type HTTPError struct {
	Status  int
	Message string
	Managed ManagedError
}

func (e *HTTPError) Error() string {
	if e.Managed.Code != 0 {
		typ := e.Managed.Type
		if typ == "" {
			typ = "unknown"
		}
		return fmt.Sprintf("中转服务 HTTP %d（业务码 %d，%s）：%s", e.Status, e.Managed.Code, typ, e.Message)
	}
	return fmt.Sprintf("中转服务 HTTP %d：%s", e.Status, e.Message)
}

func (c *Client) Do(ctx context.Context, method, path string, body any) ([]byte, error) {
	start := time.Now()
	raw, err := c.send(ctx, method, path, body)
	if c.Observe != nil {
		status := 200
		var httpErr *HTTPError
		if errors.As(err, &httpErr) {
			status = httpErr.Status
		} else if err != nil {
			status = 0
		}
		c.Observe(ctx, Call{Method: method, Path: path, Body: body, Status: status, Response: raw, Err: err, Took: time.Since(start)})
	}
	return raw, err
}

func (c *Client) send(ctx context.Context, method, path string, body any) ([]byte, error) {
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
	if _, ok := ctx.Deadline(); !ok && c.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, c.Timeout)
		defer cancel()
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
		managed := ParseManagedError(raw)
		if c.Key != "" {
			managed.Message = strings.ReplaceAll(managed.Message, c.Key, "[redacted]")
			managed.UserMessage = strings.ReplaceAll(managed.UserMessage, c.Key, "[redacted]")
			managed.UpstreamCode = strings.ReplaceAll(managed.UpstreamCode, c.Key, "[redacted]")
			managed.UpstreamType = strings.ReplaceAll(managed.UpstreamType, c.Key, "[redacted]")
		}
		return nil, &HTTPError{Status: resp.StatusCode, Message: msg, Managed: managed}
	}
	return raw, nil
}

func (c *Client) Poll(ctx context.Context, id string) ([]byte, error) {
	return c.Do(ctx, http.MethodGet, "/v1/tasks/"+url.PathEscape(id), nil)
}
