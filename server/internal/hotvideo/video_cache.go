package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"time"
)

// Single videos for display (视频详情, 文案提取, 一键复刻 reading a link) are
// reused for CacheTTL.Video. Play addresses expire, so anything that
// downloads (importing a material, the remake original) reads live through
// Client instead.

type cachedVideo struct {
	Video
	CachedAt time.Time `json:"cachedAt"`
}

// Video is the cached copy when fresh, else a live read that is then kept.
func (s *Service) Video(ctx context.Context, id string) (Video, error) {
	row, err := s.Store.Get(ctx, "hot_videos", id)
	var c cachedVideo
	// A copy without a play address (a hot-list item) is not a detail: read live.
	if err == nil && json.Unmarshal(row.Data, &c) == nil && c.URL != "" && !c.CachedAt.IsZero() && time.Since(c.CachedAt) < s.videoFresh() {
		return c.Video, nil
	}
	v, err := s.Client.Detail(ctx, id)
	if err != nil {
		return v, err
	}
	s.keep(ctx, v, time.Now().UTC())
	return v, nil
}

// VideoByLink resolves a share link once per CacheTTL.Video (the same link
// pasted again, or by someone else, does not call TikHub).
func (s *Service) VideoByLink(ctx context.Context, link string) (Video, error) {
	key := core.Digest("link:" + strings.TrimSpace(link))[:32]
	row, err := s.Store.Get(ctx, "hot_links", key)
	var saved struct {
		VideoID  string    `json:"videoId"`
		CachedAt time.Time `json:"cachedAt"`
	}
	if err == nil && json.Unmarshal(row.Data, &saved) == nil && saved.VideoID != "" && time.Since(saved.CachedAt) < s.videoFresh() {
		return s.Video(ctx, saved.VideoID)
	}
	v, err := s.Client.ShareVideo(ctx, link)
	if err != nil {
		return v, err
	}
	now := time.Now().UTC()
	s.keep(ctx, v, now)
	saved.VideoID, saved.CachedAt = v.ID, now
	_, _ = s.Store.Put(ctx, "hot_links", core.Record{ID: key, Data: core.Data(saved)}, row.Version)
	return v, nil
}

// Remember keeps a freshly fetched search page's videos for the detail page.
// Items without a play address (the hot list) are not kept: they would stand
// in for a full detail and leave the page without a player.
func (s *Service) Remember(ctx context.Context, items []Video, at time.Time) {
	if at.IsZero() {
		at = time.Now().UTC()
	}
	for _, v := range items {
		if v.URL != "" {
			s.keep(ctx, v, at)
		}
	}
}

func (s *Service) keep(ctx context.Context, v Video, at time.Time) {
	if v.ID == "" {
		return
	}
	old, _ := s.Store.Get(ctx, "hot_videos", v.ID)
	_, _ = s.Store.Put(ctx, "hot_videos", core.Record{ID: v.ID, Data: core.Data(cachedVideo{v, at})}, old.Version)
}
