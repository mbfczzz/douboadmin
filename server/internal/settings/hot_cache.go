package settings

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// How long TikHub answers are reused (服务接入配置 → 热门视频接口), in
// minutes. Only what must be live (the watermark-free original and the play
// address a download uses) bypasses these.
type HotCacheField struct {
	Key          string
	Label        string
	Default, Min int
	Max          int
	Hint         string
}

var HotCacheFields = []HotCacheField{
	{"HOT_CACHE_FEED_MINUTES", "创作页视频流缓存（分钟）", 1440, 5, 1440, "所有人共用的创作页视频，到期前 1 分钟后台自动刷新。"},
	{"HOT_CACHE_SEARCH_MINUTES", "搜索结果缓存（分钟）", 5, 1, 1440, "同一关键词、排序和页码在这段时间内不再请求 TikHub。"},
	{"HOT_CACHE_WORDS_MINUTES", "热门搜索词缓存（分钟）", 10, 1, 1440, "热门视频页的抖音热词。"},
	{"HOT_CACHE_VIDEO_MINUTES", "视频详情与链接解析缓存（分钟）", 30, 1, 720, "视频详情页和粘贴链接读取的视频；播放地址会过期，建议不超过 120。导入素材和一键复刻取原视频时总是实时读取。"},
}

// HotCacheMinutes reads one duration; empty means the default.
func HotCacheMinutes(f HotCacheField, value string) (time.Duration, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Duration(f.Default) * time.Minute, nil
	}
	n, err := strconv.Atoi(value)
	if err != nil || n < f.Min || n > f.Max {
		return 0, fmt.Errorf("%s请填写 %d–%d 的整数", f.Label, f.Min, f.Max)
	}
	return time.Duration(n) * time.Minute, nil
}

// HotCache reads all four, falling back to defaults for bad values.
func HotCache(v Values) map[string]time.Duration {
	out := map[string]time.Duration{}
	for _, f := range HotCacheFields {
		d, err := HotCacheMinutes(f, v[f.Key])
		if err != nil {
			d = time.Duration(f.Default) * time.Minute
		}
		out[f.Key] = d
	}
	return out
}
