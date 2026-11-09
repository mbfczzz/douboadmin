package media

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"encoding/base64"
	"fmt"
	"strings"
)

// saveInline stores a base64 data URL result (for example an image returned
// as b64_json) through the same type checks and storage as downloads.
func (s *Service) saveInline(ctx context.Context, j core.Job, u string) (string, error) {
	_, payload, ok := strings.Cut(u, ",")
	if !ok || !strings.Contains(u[:len(u)-len(payload)], ";base64") {
		return "", fmt.Errorf("生成结果数据无效")
	}
	if base64.StdEncoding.DecodedLen(len(payload)) > 30<<20 {
		return "", fmt.Errorf("生成结果超过大小限制")
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(payload))
	if err != nil {
		return "", fmt.Errorf("生成结果数据无效")
	}
	return s.storeResult(ctx, j, bytes.NewReader(data), int64(len(data)))
}
