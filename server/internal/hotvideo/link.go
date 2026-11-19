package hotvideo

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// 文案提取: a pasted Douyin share text ("… https://v.douyin.com/xxxx/ 复制此链接…")
// becomes a video ID. Only Douyin hosts are accepted, and a short link is
// followed hop by hop without leaving them, so the server never fetches an
// address the user chose.
var (
	linkPattern = regexp.MustCompile(`https?://[^\s"'<>，。]+`)
	pathID      = regexp.MustCompile(`/(?:video|note)/([0-9]{6,32})`)
	queryID     = regexp.MustCompile(`[?&](?:modal_id|aweme_id|vid)=([0-9]{6,32})`)
	douyinHosts = map[string]bool{"v.douyin.com": true, "douyin.com": true, "www.douyin.com": true, "m.douyin.com": true, "iesdouyin.com": true, "www.iesdouyin.com": true}
)

var ErrNotDouyin = errors.New("请粘贴抖音视频的分享链接")

// Follow returns where a short link points (its Location header).
type Follow func(ctx context.Context, link string) (string, error)

func LinkID(ctx context.Context, text string, follow Follow) (string, error) {
	link := linkPattern.FindString(text)
	for hop := 0; hop < 4; hop++ {
		u, err := url.Parse(link)
		if link == "" || err != nil || !douyinHosts[strings.ToLower(u.Hostname())] {
			return "", ErrNotDouyin
		}
		if m := pathID.FindStringSubmatch(u.Path); m != nil {
			return m[1], nil
		}
		if m := queryID.FindStringSubmatch("?" + u.RawQuery); m != nil {
			return m[1], nil
		}
		if follow == nil {
			break
		}
		if link, err = follow(ctx, u.String()); err != nil {
			return "", errors.New("链接打开失败，请确认链接完整")
		}
	}
	return "", errors.New("没有在链接里找到视频")
}

// FollowHTTP asks the link for its redirect without reading any page.
func FollowHTTP(ctx context.Context, link string) (string, error) {
	r, err := http.NewRequestWithContext(ctx, "GET", link, nil)
	if err != nil {
		return "", err
	}
	r.Header.Set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")
	client := &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(r)
	if err != nil {
		return "", err
	}
	response.Body.Close()
	next, err := response.Location()
	if err != nil {
		return "", err
	}
	return next.String(), nil
}
