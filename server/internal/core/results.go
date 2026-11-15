package core

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Keep single results unchanged. A multi-image result is an ordered JSON array
// in the existing result column, never a comma-separated URL or a contact sheet.
func PackResults(values []string) string {
	if len(values) == 0 {
		return ""
	}
	if len(values) == 1 {
		return values[0]
	}
	return string(Data(values))
}

func ResultRefs(value string) ([]string, error) {
	if value == "" {
		return nil, nil
	}
	if !strings.HasPrefix(value, "[") {
		return []string{value}, nil
	}
	var values []string
	if json.Unmarshal([]byte(value), &values) != nil || len(values) == 0 || len(values) > 32 {
		return nil, fmt.Errorf("图片结果列表无效")
	}
	for _, item := range values {
		if item == "" || strings.HasPrefix(item, "[") {
			return nil, fmt.Errorf("图片结果地址无效")
		}
	}
	return values, nil
}
