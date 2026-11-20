package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

type Service struct {
	Client *Client
	Store  store.Store
	// Redis holds the 创作 feed (feed.go); without it feed pages use Store.
	Redis *redis.Client
	// Keywords are the 创作 feed's chips (HOT_FEED_KEYWORDS).
	Keywords []string
	// Source of the 创作 feed (HOT_FEED_SOURCE): "billboard" (default, the
	// video hot list) or "search" (keyword search).
	Source string
	// How long answers are reused (服务接入配置 → 热门视频接口); zero = default.
	TTL CacheTTL
}

// CacheTTL: feed pages, keyword searches, hot words, and single videos
// (detail page and share-link reads). Live reads skip all of them.
type CacheTTL struct{ Feed, Search, Words, Video time.Duration }

func pick(d, fallback time.Duration) time.Duration {
	if d > 0 {
		return d
	}
	return fallback
}
func (s *Service) feedFresh() time.Duration   { return pick(s.TTL.Feed, 24*time.Hour) }
func (s *Service) searchFresh() time.Duration { return pick(s.TTL.Search, 5*time.Minute) }
func (s *Service) wordsFresh() time.Duration  { return pick(s.TTL.Words, 10*time.Minute) }
func (s *Service) videoFresh() time.Duration  { return pick(s.TTL.Video, 30*time.Minute) }

func (s *Service) Ready() bool { return s != nil && s.Client.Ready() }
func (s *Service) Search(ctx context.Context, q Query) (Result, error) {
	if q.Feed && s.Redis != nil {
		// Fresh pages come from Redis (first pages are refreshed in the
		// background); an older one (a later page, a failed refresh) is
		// fetched again, and served only if TikHub fails.
		cached, ok := s.feedGet(ctx, q)
		if ok && time.Since(cached.FetchedAt) < s.feedFresh() {
			return cached, nil
		}
		r, err := s.feedFetch(ctx, q)
		if err != nil && ok {
			return cached, nil
		}
		return r, err
	}
	id := s.cacheID(q)
	old, e := s.Store.Get(ctx, "hot_cache", id)
	if e == nil {
		var data Result
		// Feed keywords are the same for everyone (used without Redis).
		fresh := s.searchFresh()
		if q.Feed {
			fresh = s.feedFresh()
		}
		if json.Unmarshal(old.Data, &data) == nil && time.Since(data.FetchedAt) < fresh {
			data.Cached = true
			return data, nil
		}
	}
	result, e := s.fetch(ctx, q)
	if e != nil {
		return result, e
	}
	_, _ = s.Store.Put(ctx, "hot_cache", core.Record{ID: id, Data: core.Data(result)}, old.Version)
	return result, nil
}

// CacheTTLs are the durations in use (configured or default).
func (s *Service) CacheTTLs() CacheTTL {
	return CacheTTL{Feed: s.feedFresh(), Search: s.searchFresh(), Words: s.wordsFresh(), Video: s.videoFresh()}
}
