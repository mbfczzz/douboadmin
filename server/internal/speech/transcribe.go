package speech

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Segment struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
}
type Transcript struct {
	Text     string    `json:"text"`
	Segments []Segment `json:"segments"`
}
type Rejected struct{ Status int }

func (e *Rejected) Error() string {
	return fmt.Sprintf("语音识别服务拒绝请求（HTTP %d），请检查接口配置与音轨", e.Status)
}

// Client uses the documented multipart transcription contract supported by compatible ASR services.
type Client struct {
	BaseURL, Key, Model string
	HTTP                *http.Client
}

func (c *Client) Ready() bool { return c != nil && c.BaseURL != "" && c.Key != "" && c.Model != "" }
func (c *Client) Transcribe(ctx context.Context, path string) (Transcript, error) {
	var result Transcript
	if !c.Ready() {
		return result, fmt.Errorf("语音识别接口尚未配置")
	}
	file, e := os.Open(path)
	if e != nil {
		return result, e
	}
	defer file.Close()
	info, e := file.Stat()
	if e != nil || info.Size() > 25<<20 {
		return result, fmt.Errorf("识别音轨不能超过 25 MB")
	}
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	_ = form.WriteField("model", c.Model)
	part, e := form.CreateFormFile("file", filepath.Base(path))
	if e != nil {
		return result, e
	}
	if _, e = io.Copy(part, file); e != nil {
		return result, e
	}
	if e = form.Close(); e != nil {
		return result, e
	}
	request, e := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(c.BaseURL, "/")+"/audio/transcriptions", &body)
	if e != nil {
		return result, e
	}
	request.Header.Set("Authorization", "Bearer "+c.Key)
	request.Header.Set("Content-Type", form.FormDataContentType())
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 120 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, e := client.Do(request)
	if e != nil {
		return result, fmt.Errorf("语音识别连接中断，请核实任务后再试")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		if response.StatusCode >= 400 && response.StatusCode < 500 && response.StatusCode != 408 && response.StatusCode != 429 {
			return result, &Rejected{Status: response.StatusCode}
		}
		return result, fmt.Errorf("语音识别服务返回 HTTP %d", response.StatusCode)
	}
	raw, e := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if e != nil || len(raw) > 2<<20 {
		return result, fmt.Errorf("语音识别结果不完整")
	}
	if e = json.Unmarshal(raw, &result); e != nil || strings.TrimSpace(result.Text) == "" {
		return result, fmt.Errorf("未识别到有效语音")
	}
	if len([]rune(result.Text)) > 10000 || len(result.Segments) > 1000 {
		return result, fmt.Errorf("识别结果过长")
	}
	return result, nil
}
