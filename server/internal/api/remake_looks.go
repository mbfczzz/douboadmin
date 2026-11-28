package api

import (
	"context"
	"doubo/server/internal/hotvideo"
	"doubo/server/internal/media"
	"doubo/server/internal/vision"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// swapLooks fills each swap's Look with its picture's description (a
// person's face and hair, a product's look), so the description says who
// the new person is. pictures are the user's asset ids in @图片 order. Each
// picture is read once by the vision model and kept on the asset; one that
// cannot be read (no vision model, a slow or failed call) goes without.
func (a *Server) swapLooks(ctx context.Context, user string, b *vision.Breakdown, pictures []string, swaps []hotvideo.Swap) {
	if !a.Vision.Ready() || a.Media == nil || len(pictures) == 0 {
		return
	}
	read, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	for i := range swaps {
		if swaps[i].Picture < 1 || swaps[i].Picture > len(pictures) {
			continue
		}
		kind := "product"
		if hotvideo.SubjectKind(b, swaps[i].Name) == "person" {
			kind = "person"
		}
		wg.Add(1)
		go func(s *hotvideo.Swap, id string) {
			defer wg.Done()
			s.Look = a.pictureLook(read, user, id, kind)
		}(&swaps[i], pictures[swaps[i].Picture-1])
	}
	wg.Wait()
}

// pictureLook is the user's picture's look of kind, read once and kept on
// the asset ("looks": kind -> text).
func (a *Server) pictureLook(ctx context.Context, user, id, kind string) string {
	row, err := a.Store.Get(ctx, "assets", id)
	var asset struct {
		media.Asset
		Looks map[string]string `json:"looks"`
	}
	if err != nil || row.Owner != user || json.Unmarshal(row.Data, &asset) != nil || !strings.HasPrefix(asset.Type, "image/") {
		return ""
	}
	if look := asset.Looks[kind]; look != "" {
		return look
	}
	url, err := a.Media.InputURL(ctx, asset.Key)
	if err != nil {
		return ""
	}
	look, err := a.Vision.Describe(ctx, url, kind)
	if err != nil || look == "" {
		slog.Warn("remake picture look", "asset", id, "error", err)
		return ""
	}
	looks := map[string]string{kind: look}
	for k, v := range asset.Looks {
		if k != kind {
			looks[k] = v
		}
	}
	a.keepVideoFacts(context.WithoutCancel(ctx), row, map[string]any{"looks": looks})
	return look
}
