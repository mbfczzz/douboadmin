package hotvideo

import (
	"context"
	"testing"
)

func TestLinkID(t *testing.T) {
	follow := func(_ context.Context, link string) (string, error) {
		if link == "https://v.douyin.com/abc/" {
			return "https://www.iesdouyin.com/share/video/7301234567890123456/?region=CN", nil
		}
		return "https://evil.example.com/video/7301234567890123456", nil
	}
	cases := map[string]string{
		"看看这个 https://v.douyin.com/abc/ 复制此链接，打开抖音":                    "7301234567890123456",
		"https://www.douyin.com/video/7301234567890123457":             "7301234567890123457",
		"https://www.douyin.com/jingxuan?modal_id=7301234567890123458": "7301234567890123458",
	}
	for text, want := range cases {
		if got, err := LinkID(context.Background(), text, follow); err != nil || got != want {
			t.Fatalf("%q: got %q, %v", text, got, err)
		}
	}
	for _, text := range []string{"没有链接", "https://example.com/video/7301234567890123456", "https://v.douyin.com/other/"} {
		if _, err := LinkID(context.Background(), text, follow); err == nil {
			t.Fatalf("%q should be rejected", text)
		}
	}
}
