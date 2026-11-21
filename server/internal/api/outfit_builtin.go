package api

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// Built-in outfits: pictures drawn with Codex ship with the release
// (media/outfits/<id>.jpg, ids from defaultOutfits). At startup each one not
// yet in the library is added once, published; an outfit already there,
// edited or deleted by an administrator is left alone. With OSS the picture
// goes to system/outfits/<content hash>/<id>.jpg; without it (development) it
// is read from the media directory.

// SeedBuiltinOutfits retries every five minutes until every shipped outfit is in.
func (a *Server) SeedBuiltinOutfits(ctx context.Context) {
	for ctx.Err() == nil {
		added, err := a.seedBuiltinOutfits(ctx)
		if added > 0 {
			slog.Info("built-in outfits added to the AI试衣 library", "count", added)
		}
		if err == nil {
			return
		}
		slog.Warn("built-in outfits incomplete; retrying", "error", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Minute):
		}
	}
}

func (a *Server) seedBuiltinOutfits(ctx context.Context) (int, error) {
	dir := filepath.Join(a.Config.MediaDir, "outfits")
	added := 0
	for i, d := range defaultOutfits {
		id := "default-" + d.ID
		if _, err := a.Store.Get(ctx, "outfits", id); err == nil {
			continue
		} else if !errors.Is(err, core.ErrNotFound) {
			return added, err
		}
		data, err := os.ReadFile(filepath.Join(dir, d.ID+".jpg"))
		if err != nil {
			continue // no picture shipped for this one
		}
		key, url := "outfits/"+d.ID+".jpg", ""
		if a.Objects != nil {
			key = "system/outfits/" + core.Digest(string(data))[:16] + "/" + d.ID + ".jpg"
			if err := a.Objects.Put(ctx, key, bytes.NewReader(data), "image/jpeg"); err != nil {
				return added, fmt.Errorf("upload %s: %w", d.ID, err)
			}
		} else if a.Config.Production {
			return added, fmt.Errorf("OSS storage is not configured")
		} else {
			url = "/media/" + key
		}
		assetID := core.Digest("builtin-outfit:" + key)[:32]
		asset := core.Record{ID: assetID, Owner: "system", Data: core.Data(map[string]any{"name": d.Title, "url": url, "key": key, "type": "image/jpeg", "size": len(data)})}
		if _, err := a.Store.Put(ctx, "assets", asset, 0); err != nil && err != core.ErrConflict {
			return added, err
		}
		o := core.Outfit{Title: d.Title, Category: d.Category, Description: d.Description, ImageAssetID: assetID,
			ImageKey: key, ImageType: "image/jpeg", ImageSize: int64(len(data)), Published: true, Sort: 1000 + i}
		if _, err := a.Store.Put(ctx, "outfits", core.Record{ID: id, Data: core.Data(o)}, 0); err != nil {
			if err == core.ErrConflict {
				continue // another instance added it
			}
			return added, err
		}
		added++
	}
	return added, nil
}
