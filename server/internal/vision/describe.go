package vision

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

// A remake swaps a person in @视频1 for the one in a picture. Named only as
// "@图片1中的人物" next to a full video of someone else, a video model draws
// the original again; the text must say who the new person is. So each
// picture is described once: a person's face and hair (not clothes, pose or
// background), a product's look.
const describePerson = "这张图片中的人物将替换进一段视频。只用一句话描述能让视频模型认出这是同一个人的长相特征：脸型、五官特点、发型与发色、肤色、年龄感，以及明显特征（痣、眼镜、耳饰等）。不描述衣服、姿势、背景和表情，不写真实姓名，不超过 60 字，只输出描述本身。"

const describeProduct = "这张图片中的商品将替换进一段视频。只用一句话描述它的外观：品类、颜色、材质、形状、图案和上面的文字。不描述背景，不超过 60 字，只输出描述本身。"

// Describe returns the picture's look for a remake: kind "person" gives a
// face, anything else a product's look. The fallback model reads when this
// one cannot be used.
func (c *Client) Describe(ctx context.Context, imageURL, kind string) (string, error) {
	if !c.own() {
		if c != nil && c.Fallback.own() {
			return c.Fallback.Describe(ctx, imageURL, kind)
		}
		return "", fmt.Errorf("视频理解未配置")
	}
	ask := describeProduct
	if kind == "person" {
		ask = describePerson
	}
	body := map[string]any{
		"model": c.Model,
		"messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "image_url", "image_url": map[string]string{"url": imageURL}},
			map[string]any{"type": "text", "text": ask},
		}}},
		"temperature": 0.2,
		"max_tokens":  300,
	}
	if strings.HasPrefix(c.Model, "doubao-seed") {
		body["thinking"] = map[string]string{"type": "disabled"}
	}
	raw, _ := json.Marshal(body)
	r, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(c.BaseURL, "/")+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	r.Header.Set("Authorization", "Bearer "+c.Key)
	r.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	res, err := client.Do(r)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != 200 {
		return "", upstreamError(res.StatusCode, data)
	}
	var reply struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(data, &reply) != nil || len(reply.Choices) == 0 {
		return "", fmt.Errorf("图片描述返回格式无效")
	}
	return clip(strings.Trim(strings.TrimSpace(reply.Choices[0].Message.Content), "。.\"“”"), 80), nil
}
