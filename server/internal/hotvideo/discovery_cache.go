package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"time"
)

func (s *Service) Hotwords(ctx context.Context) ([]string, error) {
	id := core.Digest("hotwords:" + s.Client.BaseURL + core.Digest(s.Client.Key))[:32]
	old, _ := s.Store.Get(ctx, "hot_cache", id)
	var saved struct {
		Words     []string  `json:"words"`
		FetchedAt time.Time `json:"fetchedAt"`
	}
	_ = json.Unmarshal(old.Data, &saved)
	if len(saved.Words) > 0 && time.Since(saved.FetchedAt) < 10*time.Minute {
		return saved.Words, nil
	}
	words, err := s.Client.Hotwords(ctx)
	if err != nil {
		return nil, err
	}
	saved.Words = words
	saved.FetchedAt = time.Now().UTC()
	_, _ = s.Store.Put(ctx, "hot_cache", core.Record{ID: id, Data: core.Data(saved)}, old.Version)
	return words, nil
}
