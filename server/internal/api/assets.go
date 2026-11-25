package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"
)

func (a *Server) upload(w http.ResponseWriter, r *http.Request) {
	if a.Config.Production && a.Objects == nil {
		if identity(r).Role == "admin" {
			fail(w, 503, "请先在后台系统设置中配置 OSS 存储")
		} else {
			fail(w, 503, errNotReady.Error())
		}
		return
	}
	avatar := r.URL.Query().Get("purpose") == "avatar" || r.URL.Query().Get("purpose") == "cover"
	// Videos may be up to 500 MB (一键复刻 takes whole phone recordings);
	// other files stay at 50 MB, checked once the type is known.
	limit := int64(videoUploadLimit)
	message := "文件不能超过 500 MB"
	if avatar {
		limit = 5 << 20
		message = "图片不能超过 5 MB"
	} else {
		// A large upload outlasts the server's 90-second request window.
		rc := http.NewResponseController(w)
		_ = rc.SetReadDeadline(time.Now().Add(workUploadWindow))
		_ = rc.SetWriteDeadline(time.Now().Add(workUploadWindow))
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
	if _, ok := assetExts[typ]; !ok {
		fail(w, 400, "支持 JPG、PNG、WebP、MP4、MP3 和 WAV")
		return
	}
	if !strings.HasPrefix(typ, "video/") && header.Size > fileUploadLimit {
		fail(w, 400, "文件不能超过 50 MB（视频可到 500 MB）")
		return
	}
	length := 0.0 // read here so 参考视频计费 never fetches a large video again
	if strings.HasPrefix(typ, "video/") {
		length, _ = media.MP4Duration(file)
		_, _ = file.Seek(0, 0)
	}
	row, e := a.saveAsset(r.Context(), identity(r).ID, file, header.Filename, typ, header.Size)
	if e != nil {
		if errors.Is(e, errSaveFile) {
			fail(w, 503, "文件保存失败")
		} else {
			dbError(w, e)
		}
		return
	}
	if length > 0 {
		a.keepDuration(r.Context(), row, length)
		if fresh, err := a.Store.Get(r.Context(), "assets", row.ID); err == nil {
			row = fresh
		}
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
