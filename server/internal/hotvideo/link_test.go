package hotvideo

import "testing"

func TestParseLink(t *testing.T) {
	cases := map[string][2]string{
		"看看这个 https://v.douyin.com/abc/ 复制此链接，打开抖音":                      {"", "https://v.douyin.com/abc/"},
		"https://www.douyin.com/video/7301234567890123457":               {"7301234567890123457", ""},
		"https://www.douyin.com/jingxuan?modal_id=7301234567890123458":   {"7301234567890123458", ""},
		"https://www.iesdouyin.com/share/video/7301234567890123459/?a=1": {"7301234567890123459", ""},
	}
	for text, want := range cases {
		id, link, err := ParseLink(text)
		if err != nil || id != want[0] || link != want[1] {
			t.Fatalf("%q: got %q %q %v", text, id, link, err)
		}
	}
	for _, text := range []string{"没有链接", "https://example.com/video/7301234567890123456", "https://user@v.douyin.com/abc/"} {
		if _, _, err := ParseLink(text); err == nil {
			t.Fatalf("%q should be rejected", text)
		}
	}
}

func TestShareResultReasons(t *testing.T) {
	ok, err := shareResult(map[string]any{"data": map[string]any{"aweme_detail": map[string]any{"aweme_id": "7301", "desc": "文案"}}})
	if err != nil || ok.ID != "7301" || ok.Text != "文案" {
		t.Fatalf("got %+v %v", ok, err)
	}
	_, err = shareResult(map[string]any{"data": map[string]any{"filter_list": []any{map[string]any{"reason": "5"}}}})
	if err == nil || err.Error() != "该视频是私密内容，无法读取" {
		t.Fatalf("private reason: %v", err)
	}
}
