// Package vision asks a video-understanding model (Doubao Seed Vision on
// Volcengine Ark by default, any OpenAI-compatible chat API that takes
// video_url) to break a video down for 一键复刻: hook, shots, selling points.
// Videos over 50 MB go through Ark's Files API (files.go).
package vision

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL, Key, Model string
	HTTP                *http.Client
	// Fallback watches when this model cannot be used (not configured, not
	// activated or refused): the 豆包 chat model, which also takes video.
	Fallback *Client
}

func (c *Client) own() bool { return c != nil && c.BaseURL != "" && c.Key != "" && c.Model != "" }

func (c *Client) Ready() bool { return c.own() || c != nil && c.Fallback.own() }

// ModelID identifies the model that will actually watch a video. It also
// keeps cached notes/breakdowns separate when an invalid primary is replaced
// by another fallback model.
func (c *Client) ModelID() string {
	if c.own() {
		return c.Model
	}
	if c != nil && c.Fallback.own() {
		return c.Fallback.Model
	}
	return ""
}

// Shot is one beat of the original, in seconds from the start.
type Shot struct {
	Start  float64 `json:"start"`
	End    float64 `json:"end"`
	Scene  string  `json:"scene"`
	Action string  `json:"action"`
	Camera string  `json:"camera"`
	Speech string  `json:"speech"`
}

// Subject is someone or something the video is about, which a 一键复刻 may
// swap for the user's own picture.
type Subject struct {
	Name string `json:"name"` // 主角、商品…
	Kind string `json:"kind"` // person | product | other
	Look string `json:"look"` // appearance, to recognise it
	When string `json:"when"` // e.g. 0–8秒
}

type Breakdown struct {
	Subjects      []Subject `json:"subjects"`
	Summary       string    `json:"summary"`
	Hook          string    `json:"hook"`
	Structure     string    `json:"structure"`
	SellingPoints []string  `json:"sellingPoints"`
	Style         string    `json:"style"`
	Music         string    `json:"music"`
	Shots         []Shot    `json:"shots"`
}

const instruction = `你是短视频爆款拆解专家。请完整观看这条视频，拆解它为什么能火，只输出一个 JSON 对象，不要任何其他文字：
{"subjects":[{"name":"主体名称，如 主角、商品","kind":"person 或 product 或 other","look":"外观特征，便于辨认","when":"出现的时间段，如 0-8秒"}],"summary":"一句话概括视频内容","hook":"前 3 秒用什么画面或台词抓住观众","structure":"整体结构，如：痛点开场→产品展示→效果对比→引导下单","sellingPoints":["卖点或情绪点"],"style":"画面风格、色调、拍摄方式（手持/固定/口播等）","music":"背景音乐与音效的风格和节奏","shots":[{"start":0,"end":3,"scene":"场景与人物外观","action":"按时间顺序的具体动作","camera":"景别与运镜","speech":"台词、口播或画面字幕，没有则留空"}]}
要求：subjects 列出视频里可以被替换的主要人物和商品（1–5 个，按重要程度排序，不列背景）；shots 按时间顺序覆盖整条视频，3–12 个；时间单位为秒；描述具体、可被 AI 视频模型直接执行；没有的信息留空字符串。`

// Breakdown watches the video; when this model cannot be used (not
// configured, not activated, no access) the fallback model watches instead.
func (c *Client) Breakdown(ctx context.Context, v Video) (Breakdown, error) {
	if !c.own() {
		return c.Fallback.watchVideo(ctx, v)
	}
	b, err := c.watchVideo(ctx, v)
	var refused *refusedError
	if errors.As(err, &refused) && c.Fallback.own() {
		return c.Fallback.watchVideo(ctx, v)
	}
	return b, err
}

// watchVideo reads a small video by link and uploads a large one.
func (c *Client) watchVideo(ctx context.Context, v Video) (Breakdown, error) {
	if v.Size > URLLimit {
		return c.watchFile(ctx, v)
	}
	return c.watch(ctx, map[string]any{"url": v.URL, "fps": 1})
}

// watch asks the model about one video_url item: {url, fps} or {file_id}.
func (c *Client) watch(ctx context.Context, video map[string]any) (Breakdown, error) {
	started := time.Now()
	body := map[string]any{
		"model": c.Model,
		"messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "video_url", "video_url": video},
			map[string]any{"type": "text", "text": instruction},
		}}},
		"temperature": 0.2,
		"max_tokens":  4096,
	}
	if strings.HasPrefix(c.Model, "doubao-seed") { // no deep thinking: a breakdown does not need it
		body["thinking"] = map[string]string{"type": "disabled"}
	}
	raw, _ := json.Marshal(body)
	r, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(c.BaseURL, "/")+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return Breakdown{}, fmt.Errorf("视频理解接口地址无效")
	}
	r.Header.Set("Authorization", "Bearer "+c.Key)
	r.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 3 * time.Minute}
	}
	res, err := client.Do(r)
	if err != nil {
		slog.Warn("video understanding call", "model", c.Model, "duration_ms", time.Since(started).Milliseconds(), "error", err.Error())
		return Breakdown{}, fmt.Errorf("视频理解服务连接失败")
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode != 200 {
		slog.Warn("video understanding call", "model", c.Model, "status", res.StatusCode, "duration_ms", time.Since(started).Milliseconds())
		return Breakdown{}, upstreamError(res.StatusCode, data)
	}
	var reply struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(data, &reply) != nil || len(reply.Choices) == 0 {
		return Breakdown{}, fmt.Errorf("视频理解服务返回格式无效")
	}
	result, err := Parse(reply.Choices[0].Message.Content)
	if err != nil {
		slog.Warn("video understanding call", "model", c.Model, "status", res.StatusCode, "duration_ms", time.Since(started).Milliseconds(), "error", err.Error())
		return Breakdown{}, err
	}
	slog.Info("video understanding call", "model", c.Model, "status", res.StatusCode, "duration_ms", time.Since(started).Milliseconds())
	return result, nil
}

// Parse reads the model's JSON (tolerating code fences and stray text) and
// keeps it within sane bounds.
func Parse(text string) (Breakdown, error) {
	start, end := strings.Index(text, "{"), strings.LastIndex(text, "}")
	var b Breakdown
	if start < 0 || end <= start || json.Unmarshal([]byte(text[start:end+1]), &b) != nil {
		return Breakdown{}, fmt.Errorf("视频拆解结果无法解析")
	}
	shots := []Shot{}
	for _, s := range b.Shots {
		if s.End < s.Start {
			s.End = s.Start
		}
		s.Scene, s.Action, s.Camera, s.Speech = clip(s.Scene, 200), clip(s.Action, 300), clip(s.Camera, 100), clip(s.Speech, 300)
		if s.Scene+s.Action+s.Speech != "" && len(shots) < 12 {
			shots = append(shots, s)
		}
	}
	if len(shots) == 0 {
		return Breakdown{}, fmt.Errorf("视频拆解没有得到镜头")
	}
	b.Shots = shots
	b.Summary, b.Hook, b.Structure = clip(b.Summary, 200), clip(b.Hook, 200), clip(b.Structure, 200)
	b.Style, b.Music = clip(b.Style, 200), clip(b.Music, 120)
	points := []string{}
	for _, p := range b.SellingPoints {
		if p = clip(p, 60); p != "" && len(points) < 6 {
			points = append(points, p)
		}
	}
	b.SellingPoints = points
	subjects := []Subject{}
	for _, s := range b.Subjects {
		s.Name, s.Look, s.When = clip(s.Name, 20), clip(s.Look, 80), clip(s.When, 30)
		if s.Kind != "person" && s.Kind != "product" {
			s.Kind = "other"
		}
		if s.Name != "" && len(subjects) < 5 {
			subjects = append(subjects, s)
		}
	}
	b.Subjects = subjects
	return b, nil
}

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

func upstreamError(status int, body []byte) error {
	var reply struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(body, &reply)
	reason := map[int]string{401: "视频理解 API Key 无效", 403: "视频理解 API Key 没有该模型的权限", 404: "视频理解模型不存在或未开通", 429: "视频理解请求过于频繁"}[status]
	if reason == "" {
		reason = fmt.Sprintf("视频理解服务出错（%d）", status)
	}
	if m := clip(reply.Error.Message, 120); m != "" {
		reason += "：" + m
	}
	if status == 401 || status == 403 || status == 404 { // the model cannot be used here
		return &refusedError{reason}
	}
	return fmt.Errorf("%s", reason)
}

// refusedError: the model is missing, not activated or not allowed, so
// another model may watch instead.
type refusedError struct{ reason string }

func (e *refusedError) Error() string { return e.reason }
