package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"strings"

	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	qrcode "github.com/skip2/go-qrcode"
)

func (a *Server) shareQR(ctx context.Context, code string) (string, error) {
	png, err := qrcode.Encode(partners.SharePrefix+code, qrcode.Medium, 320)
	if err != nil {
		return "", err
	}
	if a.Objects == nil {
		if a.Config.Production {
			return "", errors.New("二维码存储暂不可用")
		}
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), nil
	}
	key := "system/share-codes/" + core.Digest(string(png)) + ".png"
	if store, ok := a.Objects.(interface {
		EnsureQR(context.Context, string, io.Reader) error
	}); ok {
		err = store.EnsureQR(ctx, key, bytes.NewReader(png))
	} else {
		err = a.Objects.Put(ctx, key, bytes.NewReader(png), "image/png")
	}
	if err != nil {
		return "", errors.New("二维码上传失败，请稍后重试")
	}
	url, err := a.Objects.URL(ctx, key)
	if err != nil || !strings.HasPrefix(url, "https://") {
		return "", errors.New("二维码链接生成失败，请稍后重试")
	}
	return url, nil
}
