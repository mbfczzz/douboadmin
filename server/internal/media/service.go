package media

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

type Objects interface {
	Put(context.Context, string, io.Reader, string) error
	URL(context.Context, string) (string, error)
}
type Asset struct {
	URL  string `json:"url"`
	Key  string `json:"key"`
	Type string `json:"type"`
	Size int64  `json:"size"`
}
type Service struct {
	Store      store.Store
	Objects    Objects
	Dir        string
	HTTP       *http.Client
	ModelIcons *BuiltinIcons
	BrandIcons *BuiltinIcons
	UIArt      *BuiltinIcons
}

func (s *Service) Inputs(ctx context.Context, j core.Job) ([]core.Reference, error) {
	out := []core.Reference{}
	for _, id := range j.Input.Assets {
		r, err := s.Store.Get(ctx, "assets", id)
		if err != nil || r.Owner != j.UserID {
			return nil, fmt.Errorf("参考素材不可用")
		}
		var a Asset
		if json.Unmarshal(r.Data, &a) != nil {
			return nil, fmt.Errorf("素材记录无效")
		}
		if s.Objects == nil {
			return nil, fmt.Errorf("参考素材需要配置 OSS 公网存储后才能提交给模型")
		}
		u, err := s.Objects.URL(ctx, a.Key)
		if signer, ok := s.Objects.(interface {
			InputURL(context.Context, string) (string, error)
		}); ok {
			u, err = signer.InputURL(ctx, a.Key)
		}
		if err != nil {
			return nil, fmt.Errorf("无法读取参考素材")
		}
		out = append(out, core.Reference{URL: u, Type: strings.Split(a.Type, "/")[0]})
	}
	return out, nil
}

// Save transfers relay results to owned storage. Deterministic IDs make retries safe.
func (s *Service) Save(ctx context.Context, j core.Job, u string) (string, error) {
	id := core.Digest(j.ID + ":result")[:32]
	if _, err := s.Store.Get(ctx, "assets", id); err == nil {
		return "asset:" + id, nil
	}
	if strings.HasPrefix(u, "data:") {
		return s.saveInline(ctx, j, u)
	}
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return "", err
	}
	client := s.HTTP
	if client == nil {
		client = PublicClient()
	}
	res, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("下载生成结果失败")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", fmt.Errorf("结果下载 HTTP %d", res.StatusCode)
	}
	tmp, err := os.CreateTemp("", "doubo-result-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	limit := int64(200 << 20)
	if j.Input.Kind == "image" {
		limit = 30 << 20
	}
	size, err := io.Copy(tmp, io.LimitReader(res.Body, limit+1))
	if err != nil || size > limit {
		return "", fmt.Errorf("生成结果不完整或超过大小限制")
	}
	return s.storeResult(ctx, j, tmp, size)
}

func (s *Service) URL(ctx context.Context, result string) (string, error) {
	if !strings.HasPrefix(result, "asset:") {
		return result, nil
	}
	r, err := s.Store.Get(ctx, "assets", strings.TrimPrefix(result, "asset:"))
	if err != nil {
		return "", err
	}
	var a Asset
	if json.Unmarshal(r.Data, &a) != nil {
		return "", fmt.Errorf("作品记录无效")
	}
	if s.Objects != nil {
		return s.Objects.URL(ctx, a.Key)
	}
	return a.URL, nil
}
