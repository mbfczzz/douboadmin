package api

import (
	"context"
	"doubo/server/internal/media"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// remakeShape is the original video's displayed size, so 生成同款 keeps a
// landscape original landscape. Videos saved before sizes were recorded are
// read once (a few range requests for the header, not the whole file) and
// the size is kept on the asset. 0, 0 when it cannot be read.
func (a *Server) remakeShape(ctx context.Context, result string) (int, int) {
	id, ok := strings.CutPrefix(result, "asset:")
	row, err := a.Store.Get(ctx, "assets", id)
	var asset media.Asset
	if !ok || err != nil || json.Unmarshal(row.Data, &asset) != nil || asset.Type != "video/mp4" {
		return 0, 0
	}
	if asset.Width > 0 && asset.Height > 0 {
		return asset.Width, asset.Height
	}
	read, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var file io.ReadSeeker
	if a.Objects != nil {
		url, err := a.Objects.URL(read, asset.Key)
		if err != nil {
			return 0, 0
		}
		file = &rangeFile{ctx: read, url: url, size: asset.Size}
	} else {
		f, err := os.Open(filepath.Join(a.Config.MediaDir, filepath.FromSlash(asset.Key)))
		if err != nil {
			return 0, 0
		}
		defer f.Close()
		file = f
	}
	w, h, err := media.MP4Shape(file)
	if err != nil {
		return 0, 0
	}
	a.keepVideoFacts(ctx, row, map[string]any{"width": w, "height": h})
	return w, h
}

// rangeFile reads a stored video by HTTP range requests, 64 KB at a time
// (the MP4 header is read in small pieces).
type rangeFile struct {
	ctx      context.Context
	url      string
	size, at int64
	from     int64
	block    []byte
}

func (f *rangeFile) Seek(offset int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		f.at = offset
	case io.SeekCurrent:
		f.at += offset
	case io.SeekEnd:
		f.at = f.size + offset
	}
	return f.at, nil
}

func (f *rangeFile) Read(p []byte) (int, error) {
	if f.at >= f.size {
		return 0, io.EOF
	}
	if f.block == nil || f.at < f.from || f.at >= f.from+int64(len(f.block)) {
		if err := f.fetch(); err != nil {
			return 0, err
		}
	}
	n := copy(p, f.block[f.at-f.from:])
	f.at += int64(n)
	return n, nil
}

func (f *rangeFile) fetch() error {
	end := min(f.size, f.at+64<<10) - 1
	req, err := http.NewRequestWithContext(f.ctx, http.MethodGet, f.url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", f.at, end))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusPartialContent {
		return fmt.Errorf("range read: HTTP %d", res.StatusCode)
	}
	block, err := io.ReadAll(io.LimitReader(res.Body, end-f.at+1))
	if err != nil || len(block) == 0 {
		return io.ErrUnexpectedEOF
	}
	f.from, f.block = f.at, block
	return nil
}
