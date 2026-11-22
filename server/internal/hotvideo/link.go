package hotvideo

import (
	"net/url"
	"regexp"
	"strings"
)

// 文案提取 / 一键复刻: a pasted Douyin share text ("… https://v.douyin.com/xxxx/
// 复制此链接…"). A link that already names the video gives its ID; a short
// link is handed to TikHub (ShareVideo), so the server never opens addresses
// users type. Only Douyin hosts are accepted.
var (
	linkPattern = regexp.MustCompile(`https?://[^\s"'<>，。]+`)
	pathID      = regexp.MustCompile(`/(?:video|note)/([0-9]{6,32})`)
	queryID     = regexp.MustCompile(`[?&](?:modal_id|aweme_id|vid)=([0-9]{6,32})`)
	douyinHosts = map[string]bool{"v.douyin.com": true, "douyin.com": true, "www.douyin.com": true, "m.douyin.com": true, "iesdouyin.com": true, "www.iesdouyin.com": true}
)

var ErrNotDouyin error = UserError("请粘贴抖音视频的分享链接")

// ParseLink returns the video ID when the link carries it, otherwise the
// cleaned Douyin link to resolve.
func ParseLink(text string) (id, link string, err error) {
	link = linkPattern.FindString(text)
	u, e := url.Parse(link)
	if link == "" || e != nil || u.User != nil || !douyinHosts[strings.ToLower(u.Hostname())] {
		return "", "", ErrNotDouyin
	}
	if m := pathID.FindStringSubmatch(u.Path); m != nil {
		return m[1], "", nil
	}
	if m := queryID.FindStringSubmatch("?" + u.RawQuery); m != nil {
		return m[1], "", nil
	}
	return "", "https://" + u.Hostname() + u.EscapedPath(), nil
}
