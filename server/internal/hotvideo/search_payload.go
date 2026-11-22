package hotvideo

import (
	"encoding/json"
	"io"
	"strings"
)

// V2 wraps each result in business_data[].data; some responses encode that
// object as JSON text. UseNumber retains exact Douyin IDs and counters.
func searchObject(value any) map[string]any {
	if m := object(value); m != nil {
		return m
	}
	text, ok := value.(string)
	if !ok || len(text) > 8<<20 {
		return nil
	}
	var m map[string]any
	decoder := json.NewDecoder(strings.NewReader(text))
	decoder.UseNumber()
	if decoder.Decode(&m) != nil {
		return nil
	}
	if decoder.Decode(new(any)) != io.EOF {
		return nil
	}
	return m
}

// Find the result list and its pagination container through API wrappers.
func searchRows(root map[string]any) ([]any, map[string]any) {
	m := root
	for range 5 {
		for _, key := range []string{"business_data", "aweme_list", "data"} {
			if rows, ok := m[key].([]any); ok {
				return rows, m
			}
		}
		next := object(m["data"])
		if next == nil {
			break
		}
		m = next
	}
	return nil, m
}

func searchVideo(row any) (map[string]any, bool) {
	item := object(row)
	if item == nil {
		return nil, false
	}
	if typ := integer(item["type"]); typ != nil && *typ != 1 {
		return nil, true // Authors, recommendations and other non-video cards.
	}
	if value, exists := item["data"]; exists {
		item = searchObject(value)
		if item == nil {
			return nil, false
		}
	}
	if typ := integer(item["type"]); typ != nil && *typ != 1 {
		return nil, true
	}
	if value, exists := item["aweme_info"]; exists {
		item = searchObject(value)
		if item == nil {
			return nil, false
		}
	}
	return item, true
}

// Prefer existing top-level pagination. V2 may carry these fields in its
// business configuration; zero and false are valid values, not missing data.
func searchMetadata(data map[string]any) map[string]any {
	config := searchObject(data["business_config"])
	sources := []map[string]any{data, config, searchObject(config["pagination"]), searchObject(config["common_config"])}
	out := map[string]any{}
	for _, key := range []string{"cursor", "has_more", "search_id", "backtrace", "log_pb"} {
		for _, source := range sources {
			if value, exists := source[key]; exists && value != nil {
				out[key] = value
				break
			}
		}
	}
	return out
}
