package api

import (
	"bytes"
	"doubo/server/internal/media"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
)

// Only streams the authorized code selected by showCode; no caller-supplied URL.
func (a *Server) shareImageFile(w http.ResponseWriter, r *http.Request, url string) {
	var data []byte
	var err error
	if strings.HasPrefix(url, "data:image/png;base64,") {
		data, err = base64.StdEncoding.DecodeString(strings.TrimPrefix(url, "data:image/png;base64,"))
	} else if strings.HasPrefix(url, "https://") {
		req, e := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
		if e != nil {
			fail(w, 503, "码图暂不可用")
			return
		}
		res, e := media.PublicClient().Do(req)
		if e != nil {
			fail(w, 503, "码图下载失败，请刷新后重试")
			return
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			fail(w, 503, "码图下载失败，请刷新后重试")
			return
		}
		data, err = io.ReadAll(io.LimitReader(res.Body, (2<<20)+1))
	}
	if err != nil || len(data) > 2<<20 || !bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")) {
		fail(w, 503, "码图格式无效")
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(data)
}
