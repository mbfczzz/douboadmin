package media

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Thumbnail signs only owned result assets. The original result URL remains
// available for full previews and for stores without image processing.
func (s *Service) Thumbnail(ctx context.Context, result, kind string) (string, error) {
	if kind != "image" && kind != "video" && kind != "mix" {
		return "", nil
	}
	signer, ok := s.Objects.(interface {
		Thumbnail(context.Context, string, string) (string, error)
	})
	if !ok || !strings.HasPrefix(result, "asset:") {
		return "", nil
	}
	row, err := s.Store.Get(ctx, "assets", strings.TrimPrefix(result, "asset:"))
	if err != nil {
		return "", err
	}
	var asset Asset
	if json.Unmarshal(row.Data, &asset) != nil || asset.Key == "" {
		return "", fmt.Errorf("invalid result asset")
	}
	return signer.Thumbnail(ctx, asset.Key, kind)
}
