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
}

func (s *Service) Ready() bool { return s != nil && s.Client.Ready() }
func (s *Service) Search(ctx context.Context, q Query) (Result, error) {
	if q.Feed && s.Redis != nil {
		if r, ok := s.feedGet(ctx, q); ok {
			return r, nil
		}
		return s.feedFetch(ctx, q)
	}
	id := s.cacheID(q)
	old, e := s.Store.Get(ctx, "hot_cache", id)
	if e == nil {
		var data Result
		// Feed keywords are the same for everyone: their pages stay 30 min.
		fresh := 5 * time.Minute
		if q.Feed {
			fresh = 30 * time.Minute
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
