package api

import (
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

func (a *Server) mediaFile(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/media/")
	if !filepath.IsLocal(filepath.FromSlash(key)) {
		http.NotFound(w, r)
		return
	}
	for _, part := range strings.Split(strings.ReplaceAll(key, "\\", "/"), "/") {
		if strings.HasPrefix(part, ".") {
			http.NotFound(w, r)
			return
		}
	}
	if !slices.Contains([]string{".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mp3", ".wav", ".ogg"}, strings.ToLower(filepath.Ext(key))) {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(a.Config.MediaDir, filepath.FromSlash(key))
	info, e := os.Stat(path)
	if e != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path)
}
