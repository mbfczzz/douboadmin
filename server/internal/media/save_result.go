package media

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func (s *Service) SaveLocal(ctx context.Context, j core.Job, path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	if info.Size() > 200<<20 {
		return "", fmt.Errorf("结果文件超过 200 MB")
	}
	return s.storeResult(ctx, j, file, info.Size())
}
func (s *Service) storeResult(ctx context.Context, j core.Job, file io.ReadSeeker, size int64) (string, error) {
	id := core.Digest(j.ID + ":result")[:32]
	if _, err := s.Store.Get(ctx, "assets", id); err == nil {
		return "asset:" + id, nil
	}
	var err error
	_, _ = file.Seek(0, 0)
	head := make([]byte, 512)
	n, _ := file.Read(head)
	_, _ = file.Seek(0, 0)
	typ := http.DetectContentType(head[:n])
	ext := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "video/mp4": ".mp4", "audio/mpeg": ".mp3", "audio/wave": ".wav", "audio/x-wav": ".wav", "audio/ogg": ".ogg", "application/ogg": ".ogg"}[typ]
	if ext == "" || (j.Input.Kind == "image" && !strings.HasPrefix(typ, "image/")) || ((j.Input.Kind == "video" || j.Input.Kind == "mix") && typ != "video/mp4") || (j.Input.Kind == "audio" && !strings.HasPrefix(typ, "audio/") && typ != "application/ogg") {
		return "", fmt.Errorf("生成结果类型无效")
	}
	key := "results/" + j.UserID + "/" + id + ext
	a := Asset{Key: key, Type: typ, Size: size}
	if s.Objects != nil {
		if writer, ok := s.Objects.(interface {
			PutResult(context.Context, string, io.Reader, string) error
		}); ok {
			err = writer.PutResult(ctx, key, file, typ)
		} else {
			err = s.Objects.Put(ctx, key, file, typ)
		}
	} else {
		full := filepath.Join(s.Dir, filepath.FromSlash(key))
		if err = os.MkdirAll(filepath.Dir(full), 0700); err == nil {
			var f *os.File
			f, err = os.OpenFile(full, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
			if err == nil {
				_, err = io.Copy(f, file)
				ce := f.Close()
				if err == nil {
					err = ce
				}
			}
		}
		a.URL = "/media/" + key
	}
	if err != nil {
		return "", err
	}
	_, err = s.Store.Put(ctx, "assets", core.Record{ID: id, Owner: j.UserID, Data: core.Data(a)}, 0)
	if err == core.ErrConflict {
		err = nil
	}
	return "asset:" + id, err
}
