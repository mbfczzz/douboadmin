package media

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

type LocalAsset struct {
	ID, Path, Type string
	Size           int64
}

func (s *Service) Local(ctx context.Context, user, id, dir string) (LocalAsset, error) {
	var result LocalAsset
	row, err := s.Store.Get(ctx, "assets", id)
	if err != nil || row.Owner != user {
		return result, fmt.Errorf("素材不存在或不属于当前用户")
	}
	var asset Asset
	if json.Unmarshal(row.Data, &asset) != nil || !filepath.IsLocal(filepath.FromSlash(asset.Key)) {
		return result, fmt.Errorf("素材记录无效")
	}
	if asset.Size > 200<<20 {
		return result, fmt.Errorf("素材过大")
	}
	var input io.ReadCloser
	if s.Objects == nil {
		input, err = os.Open(filepath.Join(s.Dir, filepath.FromSlash(asset.Key)))
	} else {
		var address string
		address, err = s.Objects.URL(ctx, asset.Key)
		if err == nil {
			var request *http.Request
			request, err = http.NewRequestWithContext(ctx, "GET", address, nil)
			if err == nil {
				client := s.HTTP
				if client == nil {
					client = PublicClient()
				}
				var response *http.Response
				response, err = client.Do(request)
				if err == nil {
					if response.StatusCode != 200 {
						response.Body.Close()
						return result, fmt.Errorf("素材下载失败")
					}
					input = response.Body
				}
			}
		}
	}
	if err != nil {
		return result, fmt.Errorf("素材读取失败")
	}
	defer input.Close()
	path := filepath.Join(dir, core.Digest(id)[:24]+filepath.Ext(asset.Key))
	file, err := os.Create(path)
	if err != nil {
		return result, err
	}
	size, err := io.Copy(file, io.LimitReader(input, (200<<20)+1))
	closed := file.Close()
	if err != nil || closed != nil || size > 200<<20 {
		return result, fmt.Errorf("素材下载不完整或过大")
	}
	return LocalAsset{ID: id, Path: path, Type: asset.Type, Size: size}, nil
}
