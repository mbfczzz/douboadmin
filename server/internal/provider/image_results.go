package provider

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strings"
)

func imageResults(raw []byte) (string, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", err
	}
	// A single output_url may only be the cover alongside the actual batch.
	keys := []string{"output_urls", "images", "outputs", "results", "data", "result", "output", "image", "output_url", "url", "image_url", "result_url", "file_url"}
	var walk func(any, int) ([]string, error)
	walk = func(value any, depth int) ([]string, error) {
		if depth > 6 {
			return nil, nil
		}
		switch v := value.(type) {
		case string:
			if v == "" {
				return nil, nil
			}
			if !httpsURL(v) && !strings.HasPrefix(v, "data:") {
				return nil, fmt.Errorf("上游结果地址无效")
			}
			return []string{v}, nil
		case []any:
			out, seen := []string{}, map[string]bool{}
			for _, item := range v {
				found, err := walk(item, depth+1)
				if err != nil {
					return nil, err
				}
				for _, u := range found {
					if !seen[u] {
						out = append(out, u)
						seen[u] = true
					}
				}
				if len(out) > 32 {
					return nil, fmt.Errorf("上游返回图片数量超过支持范围")
				}
			}
			return out, nil
		case map[string]any:
			if b64, ok := v["b64_json"].(string); ok && b64 != "" {
				return []string{"data:;base64," + b64}, nil
			}
			// Use one authoritative output container, not echoed inputs or thumbnails.
			for _, key := range keys {
				found, err := walk(v[key], depth+1)
				if err != nil || len(found) > 0 {
					return found, err
				}
			}
		}
		return nil, nil
	}
	values, err := walk(value, 0)
	return core.PackResults(values), err
}
