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
	version := a.Config.WeChatCodeVersion
	if version == "" {
		version = "trial"
	}
	if version != "trial" && version != "release" && version != "develop" {
		return "", errors.New("小程序码版本配置无效")
	}
	var png []byte
	var err error
	mini := a.WeChat != nil && a.WeChat.AppID != "" && a.WeChat.Secret != ""
	key := "system/share-codes/" + core.Digest("mini-v1:"+a.Config.WeChatAppID+":"+version+":"+code) + ".png"
	if mini {
		key = "system/share-codes/" + core.Digest("mini-v1:"+a.WeChat.AppID+":"+version+":"+code) + ".png"
		if a.Objects == nil {
			return "", errors.New("请先配置 OSS 后生成小程序码")
		}
		if checker, ok := a.Objects.(interface {
			QRExists(context.Context, string) (bool, error)
		}); ok {
			exists, e := checker.QRExists(ctx, key)
			if e != nil {
				return "", errors.New("小程序码存储暂不可用")
			}
			if exists {
				return a.signedQR(ctx, key)
			}
		}
		png, err = a.WeChat.MiniCode(ctx, code, version)
	} else {
		if a.Config.Production {
			return "", errors.New("请先配置微信 AppID 和 AppSecret 后生成小程序码")
		}
		png, err = qrcode.Encode(partners.SharePrefix+code, qrcode.Medium, 320)
	}
	if err != nil {
		return "", err
	}
	if a.Objects == nil {
		if a.Config.Production {
			return "", errors.New("二维码存储暂不可用")
		}
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), nil
	}
	if !mini {
		key = "system/share-codes/" + core.Digest(string(png)) + ".png"
	}
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
	return a.signedQR(ctx, key)
}

func (a *Server) signedQR(ctx context.Context, key string) (string, error) {
	url, err := a.Objects.URL(ctx, key)
	if err != nil || !strings.HasPrefix(url, "https://") {
		return "", errors.New("二维码链接生成失败，请稍后重试")
	}
	return url, nil
}
