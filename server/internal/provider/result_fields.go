package provider

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
)

// Unreadable means the upstream reports success but no result we can use.
// The task is finished upstream, so it must not be resubmitted or polled forever.
type Unreadable struct{ Fields string }

func (e *Unreadable) Error() string {
	return "上游显示已完成，但未返回可识别的生成结果（字段：" + e.Fields + "）"
}

// Result containers seen across relay endpoints. Request echoes such as
// image_urls are deliberately absent so an input is never taken as a result.
var resultKeys = []string{"output", "outputs", "result", "results", "data", "images", "videos", "video", "image", "audio", "url", "image_url", "video_url", "audio_url", "result_url", "file_url"}

func httpsURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}

// nestedResult finds the first HTTPS URL or base64 image under result keys.
func nestedResult(raw []byte) string {
	var top map[string]any
	if json.Unmarshal(raw, &top) != nil {
		return ""
	}
	var walk func(v any, depth int) string
	walk = func(v any, depth int) string {
		if depth > 4 {
			return ""
		}
		switch t := v.(type) {
		case string:
			if httpsURL(t) {
				return t
			}
		case []any:
			for _, item := range t {
				if found := walk(item, depth+1); found != "" {
					return found
				}
			}
		case map[string]any:
			if b64, ok := t["b64_json"].(string); ok && b64 != "" {
				return "data:;base64," + b64
			}
			for _, key := range resultKeys {
				if found := walk(t[key], depth+1); found != "" {
					return found
				}
			}
		}
		return ""
	}
	for _, key := range resultKeys {
		if found := walk(top[key], 1); found != "" {
			return found
		}
	}
	return ""
}

// fieldNames lists top-level keys for diagnostics without leaking values.
func fieldNames(raw []byte) string {
	var top map[string]json.RawMessage
	if json.Unmarshal(raw, &top) != nil {
		return "非 JSON 对象"
	}
	keys := make([]string, 0, len(top))
	for k := range top {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) > 12 {
		keys = append(keys[:12], fmt.Sprintf("等 %d 个", len(top)))
	}
	return strings.Join(keys, ", ")
}
