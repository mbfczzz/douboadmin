package settings

import (
	"strconv"
	"testing"
	"time"
)

func TestHotCacheDurations(t *testing.T) {
	d := HotCache(Values{"HOT_CACHE_FEED_MINUTES": "120", "HOT_CACHE_SEARCH_MINUTES": "", "HOT_CACHE_VIDEO_MINUTES": "abc"})
	if d["HOT_CACHE_FEED_MINUTES"] != 2*time.Hour || d["HOT_CACHE_SEARCH_MINUTES"] != 5*time.Minute || d["HOT_CACHE_VIDEO_MINUTES"] != 30*time.Minute {
		t.Fatal(d)
	}
	for _, bad := range []Values{{"HOT_CACHE_FEED_MINUTES": "2"}, {"HOT_CACHE_VIDEO_MINUTES": "721"}, {"HOT_CACHE_WORDS_MINUTES": "1.5"}} {
		if err := validate(Group{ID: "hot"}, bad, false); err == nil {
			t.Fatal("saved", bad)
		}
	}
	// Every duration is offered in 服务接入配置 with its default.
	for _, f := range HotCacheFields {
		found := false
		for _, g := range definitions {
			for _, field := range g.Fields {
				if field.Key == f.Key && g.ID == "hot" && field.Default == strconv.Itoa(f.Default) {
					found = true
				}
			}
		}
		if !found {
			t.Fatal("missing from the hot group", f.Key)
		}
	}
}
