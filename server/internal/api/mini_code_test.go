package api

import (
	"context"
	"doubo/server/internal/wechat"
	"strings"
	"testing"
)

type cachedMiniObjects struct {
	qrObjects
	keysSeen []string
}

func (o *cachedMiniObjects) QRExists(_ context.Context, key string) (bool, error) {
	o.keysSeen = append(o.keysSeen, key)
	return true, nil
}
func TestMiniCodeCacheIsSeparatedByAppAndVersion(t *testing.T) {
	a, _, _ := setup(t)
	a.WeChat = wechat.New("wx-one", "secret")
	o := &cachedMiniObjects{qrObjects: qrObjects{keys: map[string]bool{}}}
	a.Objects = o
	one, err := a.shareQR(t.Context(), "ABCD2345")
	if err != nil || !strings.HasPrefix(one, "https://") {
		t.Fatal(err)
	}
	a.Config.WeChatCodeVersion = "release"
	_, err = a.shareQR(t.Context(), "ABCD2345")
	if err != nil {
		t.Fatal(err)
	}
	a.WeChat = wechat.New("wx-two", "secret")
	_, err = a.shareQR(t.Context(), "ABCD2345")
	if err != nil {
		t.Fatal(err)
	}
	if o.keysSeen[0] == o.keysSeen[1] || o.keysSeen[1] == o.keysSeen[2] || o.puts != 0 {
		t.Fatal("cached images must not mix app or version")
	}
	a.Config.WeChatCodeVersion = "bad"
	if _, err = a.shareQR(t.Context(), "ABCD2345"); err == nil {
		t.Fatal("invalid environment")
	}
}
