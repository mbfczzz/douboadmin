package api

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
)

var errSaveFile = errors.New("asset file not saved")

var assetExts = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "audio/mpeg": ".mp3", "audio/wave": ".wav", "audio/x-wav": ".wav"}

// saveAsset stores an uploaded file for owner (OSS, or local media in
// development) and records it as that user's asset.
func (a *Server) saveAsset(ctx context.Context, owner string, file io.Reader, name, typ string, size int64) (core.Record, error) {
	id := core.NewID()
	key := "uploads/" + owner + "/" + id + assetExts[typ]
	assetURL := ""
	var e error
	if a.Objects != nil {
		e = a.Objects.Put(ctx, key, file, typ)
	} else if a.Config.Production {
		e = errors.New("OSS 存储尚未配置")
	} else {
		full := filepath.Join(a.Config.MediaDir, filepath.FromSlash(key))
		if e = os.MkdirAll(filepath.Dir(full), 0700); e == nil {
			var out *os.File
			out, e = os.OpenFile(full, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if e == nil {
				_, e = io.Copy(out, file)
				if ce := out.Close(); e == nil {
					e = ce
				}
			}
		}
		assetURL = "/media/" + key
	}
	if e != nil {
		slog.Error("upload failure", "error", e)
		return core.Record{}, errSaveFile
	}
	return a.Store.Put(ctx, "assets", core.Record{ID: id, Owner: owner, Data: core.Data(map[string]any{"name": filepath.Base(name), "url": assetURL, "key": key, "type": typ, "size": size})}, 0)
}
