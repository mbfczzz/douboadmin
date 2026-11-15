package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"encoding/json"
	"strings"
)

// Check records before pagination so one removed asset cannot break a whole page.
// Signing is still deferred until the current page is presented.
func (a *Server) featuredResultsAvailable(ctx context.Context, j core.Job) error {
	refs, err := core.ResultRefs(j.Result)
	if err != nil || len(refs) == 0 || (j.Input.Kind != "image" && len(refs) != 1) {
		return core.ErrNotFound
	}
	validURL := func(url string) bool { return httpsURL(url) || strings.HasPrefix(url, "/media/") }
	for _, ref := range refs {
		if !strings.HasPrefix(ref, "asset:") {
			if !validURL(ref) {
				return core.ErrNotFound
			}
			continue
		}
		if a.Media == nil {
			return core.ErrNotFound
		}
		row, err := a.Store.Get(ctx, "assets", strings.TrimPrefix(ref, "asset:"))
		if err != nil {
			return err
		}
		var asset media.Asset
		if row.Owner != j.UserID || json.Unmarshal(row.Data, &asset) != nil {
			return core.ErrNotFound
		}
		if j.Input.Kind == "image" && !strings.HasPrefix(asset.Type, "image/") || j.Input.Kind != "image" && !strings.HasPrefix(asset.Type, "video/") {
			return core.ErrNotFound
		}
		if a.Media.Objects != nil {
			if asset.Key == "" {
				return core.ErrNotFound
			}
		} else if !validURL(asset.URL) {
			return core.ErrNotFound
		}
	}
	return nil
}
