package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"time"
)

type Service struct {
	Client *Client
	Store  store.Store
}

func (s *Service) Ready() bool { return s != nil && s.Client.Ready() }
func (s *Service) Search(ctx context.Context, q Query) (Result, error) {
	id := core.Digest(s.Client.BaseURL + core.Digest(s.Client.Key) + string(core.Data(q)))[:32]
	old, e := s.Store.Get(ctx, "hot_cache", id)
	if e == nil {
		var data Result
		if json.Unmarshal(old.Data, &data) == nil && time.Since(data.FetchedAt) < 5*time.Minute {
			data.Cached = true
			return data, nil
		}
	}
	result, e := s.Client.Search(ctx, q)
	if e != nil {
		return result, e
	}
	_, _ = s.Store.Put(ctx, "hot_cache", core.Record{ID: id, Data: core.Data(result)}, old.Version)
	return result, nil
}
