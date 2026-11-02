package provider

import (
	"encoding/json"
	"fmt"
	"net/url"
	"slices"
	"strings"
)

type Response struct {
	TaskID, Result string
	Pending        bool
}

type Rejected struct{ Message, Details string }

func (e *Rejected) Error() string { return e.Message }

func Parse(raw []byte, kind string) (Response, error) {
	var v struct {
		ID           string          `json:"id"`
		Status       string          `json:"status"`
		Error        json.RawMessage `json:"error"`
		ErrorMessage string          `json:"error_message"`
		OutputURL    string          `json:"output_url"`
		OutputURLs   []string        `json:"output_urls"`
		Audio        *struct {
			URL string `json:"url"`
		} `json:"audio"`
		Data []struct {
			URL    string `json:"url"`
			Base64 string `json:"b64_json"`
		} `json:"data"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(raw, &v) != nil {
		return Response{}, fmt.Errorf("上游响应格式异常，请核实任务状态")
	}
	r := Response{TaskID: v.ID}
	state := strings.ToLower(v.Status)
	if (len(v.Error) > 0 && string(v.Error) != "null") || slices.Contains([]string{"failed", "error", "cancelled", "canceled"}, state) {
		// Keep upstream payloads and possible credentials out of user-visible messages.
		return r, &Rejected{Message: fmt.Sprintf("上游生成失败，请检查素材和模型参数；任务编号 %s", v.ID), Details: string(v.Error) + " " + v.ErrorMessage}
	}
	if state != "" && !slices.Contains([]string{"succeeded", "completed", "success", "done"}, state) {
		r.Pending = true
		return r, nil
	}
	if kind == "chat" {
		if len(v.Choices) > 0 {
			r.Result = strings.TrimSpace(v.Choices[0].Message.Content)
		}
	} else {
		r.Result = v.OutputURL
		if r.Result == "" && v.Audio != nil {
			r.Result = v.Audio.URL
		}
		if len(v.OutputURLs) > 0 {
			r.Result = v.OutputURLs[0]
		}
		if len(v.Data) > 0 && v.Data[0].URL != "" {
			r.Result = v.Data[0].URL
		}
		if r.Result != "" {
			u, err := url.Parse(r.Result)
			if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
				return r, fmt.Errorf("上游结果地址无效")
			}
		}
	}
	if r.Result == "" {
		if v.ID != "" {
			r.Pending = true
			return r, nil
		}
		return r, fmt.Errorf("上游未返回生成结果或任务编号")
	}
	return r, nil
}
