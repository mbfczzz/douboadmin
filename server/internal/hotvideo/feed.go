package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/settings"
	"encoding/json"
	"errors"
	"log/slog"
	"time"
)

// The 创作 page's video feed: creative keywords shared by everyone (set in
// 服务接入配置 → 热门视频接口 → 创作页关键词; Douyin's own hot words are news,
// not things to remake). With Redis their pages live there for an hour; a
// background loop refetches each first page one minute before it turns an
// hour old, so visitors are served from Redis and TikHub is called about once
// an hour per keyword. A failed refresh keeps the old page (kept up to two
// hours) and is retried the next minute.
// The hour is the default; 服务接入配置 sets it (CacheTTL.Feed).
const feedLock = 2 * time.Minute

func (s *Service) feedRefresh() time.Duration { return s.feedFresh() - time.Minute }
func (s *Service) feedKeep() time.Duration    { return 2 * s.feedFresh() }

// FeedWords are the configured keywords, or the defaults.
func (s *Service) FeedWords() []string {
	if s != nil && len(s.Keywords) > 0 {
		return s.Keywords
	}
	words, _ := settings.FeedKeywords("")
	return words
}

// FeedSource is "billboard" unless keyword search was chosen.
func (s *Service) FeedSource() string {
	if s != nil && s.Source == "search" {
		return "search"
	}
	return "billboard"
}

// fetch reads feed pages from the chosen source, everything else by search.
func (s *Service) fetch(ctx context.Context, q Query) (Result, error) {
	if q.Feed && s.FeedSource() == "billboard" {
		return s.Client.Billboard(ctx, q)
	}
	return s.Client.Search(ctx, q)
}

// Feed pages are cached per source, so switching never serves the other's.
func (s *Service) cacheID(q Query) string {
	scope := ""
	if q.Feed {
		scope = s.FeedSource() + ":"
	}
	return core.Digest(scope + s.Client.BaseURL + core.Digest(s.Client.Key) + string(core.Data(q)))[:32]
}

// FeedQuery is exactly what the mini-program sends for a keyword's first page.
func FeedQuery(keyword string) Query { return Query{Keyword: keyword, Feed: true} }

// v2: the feed now reads the video hot list by default (billboard.go).
func (s *Service) feedKey(q Query) string { return "doubo:hot:feed:v2:" + s.cacheID(q) }

func (s *Service) feedGet(ctx context.Context, q Query) (Result, bool) {
	raw, err := s.Redis.Get(ctx, s.feedKey(q)).Bytes()
	var r Result
	if err != nil || json.Unmarshal(raw, &r) != nil {
		return Result{}, false
	}
	r.Cached = true
	return r, true
}

func (s *Service) feedFetch(ctx context.Context, q Query) (Result, error) {
	r, err := s.fetch(ctx, q)
	if err != nil {
		return r, err
	}
	r.FetchedAt = time.Now().UTC()
	if raw, e := json.Marshal(r); e == nil {
		_ = s.Redis.Set(ctx, s.feedKey(q), raw, s.feedKeep()).Err()
	}
	return r, nil
}

// RunFeedRefresh keeps every feed keyword's first page fresh (API role only;
// a Redis lock lets one instance do each refresh).
func (s *Service) RunFeedRefresh(ctx context.Context) {
	if s.Redis == nil {
		return
	}
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		if s.Ready() {
			for _, keyword := range s.FeedWords() {
				s.refreshFeed(ctx, FeedQuery(keyword))
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func (s *Service) refreshFeed(ctx context.Context, q Query) {
	if r, ok := s.feedGet(ctx, q); ok && time.Since(r.FetchedAt) < s.feedRefresh() {
		return
	}
	got, err := s.Redis.SetNX(ctx, s.feedKey(q)+":lock", "1", feedLock).Result()
	if err != nil || !got {
		return
	}
	call, cancel := context.WithTimeout(ctx, 50*time.Second)
	defer cancel()
	if _, err := s.feedFetch(call, q); err != nil && !errors.Is(err, context.Canceled) {
		slog.Warn("hot feed refresh failed", "keyword", q.Keyword, "error", err.Error())
	}
	_ = s.Redis.Del(ctx, s.feedKey(q)+":lock").Err()
}
