package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

func (a *Server) upload(w http.ResponseWriter, r *http.Request) {
	if a.Config.Production && a.Objects == nil {
		fail(w, 503, "请先在后台系统设置中配置 OSS 存储")
		return
	}
	avatar := r.URL.Query().Get("purpose") == "avatar" || r.URL.Query().Get("purpose") == "cover"
	limit := int64(50 << 20)
	message := "文件不能超过 50 MB"
	if avatar {
		limit = 5 << 20
		message = "图片不能超过 5 MB"
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit+(1<<20))
	if e := r.ParseMultipartForm(2 << 20); e != nil {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		fail(w, 400, "上传失败，"+message)
		return
	}
	defer r.MultipartForm.RemoveAll()
	file, header, e := r.FormFile("file")
	if e != nil {
		fail(w, 400, "请选择文件")
		return
	}
	defer file.Close()
	if header.Size > limit {
		fail(w, 400, message)
		return
	}
	head := make([]byte, 512)
	n, _ := file.Read(head)
	_, _ = file.Seek(0, 0)
	typ := http.DetectContentType(head[:n])
	if avatar && !slices.Contains([]string{"image/jpeg", "image/png", "image/webp"}, typ) {
		fail(w, 400, "图片仅支持 JPG、PNG 和 WebP")
		return
	}
	exts := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "audio/mpeg": ".mp3", "audio/wave": ".wav", "audio/x-wav": ".wav"}
	ext, ok := exts[typ]
	if !ok {
		fail(w, 400, "支持 JPG、PNG、WebP、MP4、MP3 和 WAV")
		return
	}
	id := core.NewID()
	key := "uploads/" + identity(r).ID + "/" + id + ext
	assetURL := ""
	if a.Objects != nil {
		e = a.Objects.Put(r.Context(), key, file, typ)
	} else if a.Config.Production {
		fail(w, 503, "OSS 存储尚未配置")
		return
	} else {
		full := filepath.Join(a.Config.MediaDir, filepath.FromSlash(key))
		if e = os.MkdirAll(filepath.Dir(full), 0700); e == nil {
			var out *os.File
			out, e = os.OpenFile(full, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if e == nil {
				_, e = io.Copy(out, file)
				ce := out.Close()
				if e == nil {
					e = ce
				}
			}
		}
		assetURL = "/media/" + key
	}
	if e != nil {
		slog.Error("upload failure", "error", e)
		fail(w, 503, "文件保存失败")
		return
	}
	row, e := a.Store.Put(r.Context(), "assets", core.Record{ID: id, Owner: identity(r).ID, Data: core.Data(map[string]any{"name": filepath.Base(header.Filename), "url": assetURL, "key": key, "type": typ, "size": header.Size})}, 0)
	if e != nil {
		dbError(w, e)
		return
	}
	if row, e = a.signedAsset(r.Context(), row); e != nil {
		dbError(w, e)
		return
	}
	reply(w, 201, row)
}

func (a *Server) asset(w http.ResponseWriter, r *http.Request) {
	row, err := a.Store.Get(r.Context(), "assets", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	if row.Owner != identity(r).ID {
		fail(w, 404, "素材不存在或已删除")
		return
	}
	if row, err = a.signedAsset(r.Context(), row); err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, row)
}

// signedAsset signs the file URL and, for videos, a first-frame cover so
// reference strips and @ mentions can show a thumbnail.
func (a *Server) signedAsset(ctx context.Context, row core.Record) (core.Record, error) {
	if a.Objects == nil {
		return row, nil
	}
	var data map[string]any
	if json.Unmarshal(row.Data, &data) != nil {
		return row, fmt.Errorf("invalid asset")
	}
	key, _ := data["key"].(string)
	u, err := a.Objects.URL(ctx, key)
	if err != nil {
		return row, err
	}
	data["url"] = u
	if typ, _ := data["type"].(string); strings.HasPrefix(typ, "video/") {
		if s, ok := a.Objects.(interface {
			Thumbnail(context.Context, string, string) (string, error)
		}); ok {
			if cover, e := s.Thumbnail(ctx, key, "video"); e == nil {
				data["thumbnailUrl"] = cover
			}
		}
	}
	row.Data = core.Data(data)
	return row, nil
}
