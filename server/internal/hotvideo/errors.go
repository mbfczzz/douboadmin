package hotvideo

import (
	"encoding/json"
	"fmt"
	"strings"
)

// UserError is a reason the user can act on (a private or deleted video, an
// incomplete link); every other failure is shown to users as a generic
// error and kept for the service log (upstream, keys, balance).
type UserError string

func (e UserError) Error() string { return string(e) }

// upstreamError says why TikHub refused, in words an admin can act on: the
// status class plus TikHub's own Chinese message (top level or "detail").
func upstreamError(status int, body []byte) error {
	var reply struct {
		MessageZh string `json:"message_zh"`
		Message   string `json:"message"`
		Detail    struct {
			MessageZh string `json:"message_zh"`
			Message   string `json:"message"`
		} `json:"detail"`
	}
	_ = json.Unmarshal(body, &reply)
	detail := strings.TrimSpace(firstNonEmpty(reply.Detail.MessageZh, reply.MessageZh, reply.Detail.Message, reply.Message))
	if runes := []rune(detail); len(runes) > 120 {
		detail = string(runes[:120]) + "…"
	}
	reason := map[int]string{
		400: "抖音数据请求参数无效",
		401: "TikHub API Key 无效，请在后台检查",
		402: "TikHub 账户余额不足，请充值",
		403: "TikHub API Key 没有该接口的权限",
		404: "抖音数据接口不存在",
		422: "抖音数据请求参数无效",
		429: "抖音数据请求过于频繁，请稍后再试",
	}[status]
	if reason == "" {
		reason = fmt.Sprintf("抖音数据服务出错（%d）", status)
	}
	if detail != "" && !strings.Contains(reason, detail) {
		reason += "：" + detail
	}
	return fmt.Errorf("%s", reason)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
