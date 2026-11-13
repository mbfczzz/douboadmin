package main

import (
	"context"
	"doubo/server/internal/media"
	"doubo/server/internal/objectstore"
	"doubo/server/internal/settings"
	"fmt"
	"log/slog"
	"path/filepath"
	"time"
)

const uiArtSyncTimeout = 5 * time.Minute

// The deployment command uses the same decrypted database settings as the API.
// No API listener, reconciliation loops or generation workers are started.
func syncUIArt(ctx context.Context, dir string, values settings.Values) error {
	if values["OSS_BUCKET"] == "" && values["OSS_ACCESS_KEY_ID"] == "" && values["OSS_ACCESS_KEY_SECRET"] == "" {
		slog.Info("UI art OSS sync skipped: OSS not configured; local images retained")
		return nil
	}
	for _, key := range []string{"OSS_REGION", "OSS_BUCKET", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"} {
		if values[key] == "" {
			return fmt.Errorf("UI art OSS sync: incomplete OSS configuration (%s)", key)
		}
	}
	objects := objectstore.New(values["OSS_REGION"], values["OSS_BUCKET"], values["OSS_ACCESS_KEY_ID"], values["OSS_ACCESS_KEY_SECRET"])
	return uploadUIArt(ctx, media.NewUIArt(filepath.Join(dir, "ui-art"), objects))
}

func uploadUIArt(parent context.Context, images interface {
	Sync(context.Context) (int, error)
}) error {
	ctx, cancel := context.WithTimeout(parent, uiArtSyncTimeout)
	defer cancel()
	count, err := images.Sync(ctx)
	if err != nil {
		// SDK errors may include signed URLs. Log only the confirmed count.
		return fmt.Errorf("UI art OSS sync failed after %d images; check packaged JPEGs, OSS settings and RAM permissions", count)
	}
	slog.Info("UI art synchronized to OSS", "count", count, "prefix", "system/ui-art/")
	return nil
}
