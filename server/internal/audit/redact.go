package audit

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// MaxBody caps a stored request or response body.
const MaxBody = 16 << 10

// Field names whose values never reach the log (matched case-insensitively
// against the whole key, so "description" is not mistaken for a secret).
var secretKey = regexp.MustCompile(`(?i)^(password|passwd|newpassword|current|next|token|accesstoken|refreshtoken|secret|appsecret|apikey|api_key|privatekey|private_key|sessionkey|session_key|paysig|pay_sig|signature|sign|apiv3key|mchkey|aeskey|encodingaeskey|cookie|authorization|debugcode|phonecode)$`)

// Setting names such as WECHAT_APP_SECRET, RELAY_API_KEY or *_TOKEN.
var secretPart = regexp.MustCompile(`(?i)(secret|password|private_?key|api_?key|app_?key|aes_?key|mch_?key|v3_?key|access_?key|_token$)`)

// Request is Body for request bodies, where "code" is a credential (WeChat
// login code, activation code); in responses it is an error code.
func Request(raw []byte, truncated bool) string { return body(raw, truncated, true) }

// Body turns a raw request/response body into redacted, compact, capped
// JSON text. Non-JSON bodies are summarised by size only.
func Body(raw []byte, truncated bool) string { return body(raw, truncated, false) }

func body(raw []byte, truncated, request bool) string {
	if len(raw) == 0 {
		return ""
	}
	// Huge bodies (inline media) are not worth parsing just to log them.
	if len(raw) > 1<<20 {
		return fmt.Sprintf("（内容过大，%d 字节，未记录正文）", len(raw))
	}
	var v any
	if json.Unmarshal(raw, &v) != nil {
		if truncated {
			return fmt.Sprintf("（内容过长，已截断，超过 %d 字节）", len(raw))
		}
		return fmt.Sprintf("（非 JSON 内容，%d 字节）", len(raw))
	}
	out, _ := json.Marshal(scrub(v, "", request))
	return Cap(string(out))
}

// Value redacts an already-decoded value (for model call parameters).
func Value(v any) string {
	out, err := json.Marshal(scrub(v, "", false))
	if err != nil {
		return ""
	}
	return Cap(string(out))
}

// Cap keeps a body within MaxBody without splitting a UTF-8 character.
func Cap(s string) string {
	if len(s) <= MaxBody {
		return s
	}
	cut := MaxBody
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + "…（已截断）"
}

func scrub(v any, key string, request bool) any {
	if key != "" && (secretKey.MatchString(key) || secretPart.MatchString(key) || (request && strings.EqualFold(key, "code"))) {
		if v == nil || v == "" {
			return v
		}
		return "***"
	}
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			t[k] = scrub(child, k, request)
		}
		return t
	case []any:
		if len(t) > 50 {
			t = append(t[:50], fmt.Sprintf("…另有 %d 项", len(t)-50))
		}
		for i := range t {
			t[i] = scrub(t[i], "", request)
		}
		return t
	case string:
		// Inline media (base64 data URLs) and other long blobs stay short.
		if strings.HasPrefix(t, "data:") || len(t) > 2000 {
			return fmt.Sprintf("%s…（共 %d 字符）", string([]rune(t)[:min(80, utf8.RuneCountInString(t))]), utf8.RuneCountInString(t))
		}
		return t
	}
	return v
}
