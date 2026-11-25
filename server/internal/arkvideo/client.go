package arkvideo

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

// Client calls 火山方舟's 视频生成 API with the key from
// 服务接入配置 → 火山方舟视频生成 (not the 对话模型 / 视频理解 keys).
type Client struct {
	BaseURL, Key string
	HTTP         *http.Client
}

func (c *Client) Ready() bool { return c != nil && c.BaseURL != "" && c.Key != "" }

// Task is a 查询视频生成任务 reply. Status: queued, running, succeeded,
// failed, cancelled, expired. The video link lasts 24 hours.
type Task struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Content struct {
		VideoURL string `json:"video_url"`
	} `json:"content"`
	Usage struct {
		CompletionTokens int64 `json:"completion_tokens"`
	} `json:"usage"`
	Error *APIError `json:"error"`
}

// APIError is 方舟's error object (also a failed task's reason).
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string {
	if e.Status > 0 {
		return fmt.Sprintf("火山方舟 HTTP %d %s: %s", e.Status, e.Code, e.Message)
	}
	return "火山方舟 " + e.Code + ": " + e.Message
}

// Create submits a task and returns its id.
func (c *Client) Create(ctx context.Context, body map[string]any) (string, error) {
	var task Task
	err := c.do(ctx, "POST", "/contents/generations/tasks", body, &task)
	if err == nil && task.ID == "" {
		err = fmt.Errorf("火山方舟没有返回任务编号")
	}
	return task.ID, err
}

// Get reads a task.
func (c *Client) Get(ctx context.Context, id string) (Task, error) {
	var task Task
	err := c.do(ctx, "GET", "/contents/generations/tasks/"+id, nil, &task)
	return task, err
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	r, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, reader)
	if err != nil {
		return fmt.Errorf("火山方舟接口地址无效")
	}
	r.Header.Set("Authorization", "Bearer "+c.Key)
	r.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: time.Minute}
	}
	res, err := client.Do(r)
	if err != nil {
		return err // not known to have reached 方舟
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode/100 != 2 {
		var reply struct {
			Error APIError `json:"error"`
		}
		_ = json.Unmarshal(data, &reply)
		reply.Error.Status = res.StatusCode
		return &reply.Error
	}
	if json.Unmarshal(data, out) != nil {
		return fmt.Errorf("火山方舟返回格式无效")
	}
	return nil
}
