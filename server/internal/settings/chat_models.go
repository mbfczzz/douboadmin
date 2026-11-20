package settings

import (
	"errors"
	"regexp"
	"strings"
)

// Chat models called directly at DeepSeek / 火山方舟 (服务接入配置 → 对话模型).
// Each listed model ID becomes a chat model in 模型管理, priced per token.
const (
	DefaultDeepSeekModels = "deepseek-flash"
	DefaultArkChatModels  = "doubao-seed-2-1-lite-260915"
)

var chatModelID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`)

// ChatModels splits a comma / line separated list of provider model IDs.
func ChatModels(value string) ([]string, error) {
	seen, out := map[string]bool{}, []string{}
	for _, part := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == '，' || r == '\n' || r == '\r' }) {
		id := strings.TrimSpace(part)
		if id == "" || seen[id] {
			continue
		}
		if !chatModelID.MatchString(id) {
			return nil, errors.New("模型 ID 只能包含字母、数字、点、短横线和下划线")
		}
		seen[id] = true
		out = append(out, id)
	}
	if len(out) > 5 {
		return nil, errors.New("每家最多填写 5 个模型")
	}
	return out, nil
}
