package hotvideo

import (
	"context"
	"fmt"
	"net/url"
	"strings"
)

// ShareVideo reads a Douyin share link through TikHub (the server never opens
// the link itself). The app endpoint carries more fields; when it comes back
// empty TikHub advises the web one with the same link.
func (c *Client) ShareVideo(ctx context.Context, link string) (Video, error) {
	var last error
	for _, path := range []string{"/api/v1/douyin/app/v3/fetch_one_video_by_share_url", "/api/v1/douyin/web/fetch_one_video_by_share_url"} {
		root, err := c.request(ctx, "GET", path+"?share_url="+url.QueryEscape(link), nil)
		if err != nil {
			last = err
			continue
		}
		v, err := shareResult(root)
		if err == nil {
			return v, nil
		}
		last = err
	}
	return Video{}, last
}

// The video, or why Douyin withholds it ($.data.filter_list[0].reason).
func shareResult(root map[string]any) (Video, error) {
	data := unwrap(root)
	item := object(data["aweme_detail"])
	if list, _ := data["aweme_details"].([]any); item == nil && len(list) > 0 {
		item = object(list[0])
	}
	if item != nil {
		if v := video(item); v.ID != "" {
			return v, nil
		}
	}
	reason := ""
	if list, _ := data["filter_list"].([]any); len(list) > 0 {
		reason = str(object(list[0])["reason"])
	}
	if reason == "" {
		reason = str(object(data["filter_detail"])["filter_reason"])
	}
	switch reason {
	case "5":
		return Video{}, UserError("该视频是私密内容，无法读取")
	case "10":
		return Video{}, UserError("该视频仅部分用户可见，无法读取")
	case "8":
		return Video{}, UserError("视频不存在、已删除或受版权限制")
	}
	return Video{}, UserError("没有读取到这个视频，请确认链接完整")
}

// OriginalURL is the original upload, without watermark (TikHub: not for
// blue-V accounts or promoted videos; callers fall back to the play address).
func (c *Client) OriginalURL(ctx context.Context, id string) (string, error) {
	root, err := c.request(ctx, "GET", "/api/v1/douyin/app/v3/fetch_video_high_quality_play_url?aweme_id="+url.QueryEscape(id)+"&region=CN", nil)
	if err != nil {
		return "", err
	}
	link := str(unwrap(root)["original_video_url"])
	if u, e := url.Parse(link); e != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || strings.Contains(u.Path, "playwm") {
		return "", fmt.Errorf("未取得无水印原视频")
	}
	return link, nil
}
