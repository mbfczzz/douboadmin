package api

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Decorative photographs for the mini-program (media/ui-art/<name>.jpg).
// A stable entry point for private OSS images. Never cache signed redirects
// longer than their signatures; local fallback remains available without OSS.
var uiArtName = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

func (a *Server) uiArtFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !uiArtName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	if a.Media != nil && a.Media.UIArt != nil {
		w.Header().Set("Cache-Control", "no-store")
		url := a.Media.UIArt.URL(r.Context(), "/media/ui-art/"+name+".jpg")
		if strings.HasPrefix(url, "https://") {
			http.Redirect(w, r, url, http.StatusFound)
			return
		}
	}
	file := filepath.Join(a.Config.MediaDir, "ui-art", name+".jpg")
	if _, err := os.Stat(file); err != nil {
		http.NotFound(w, r)
		return
	}
	if w.Header().Get("Cache-Control") == "" {
		w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	}
	w.Header().Set("Content-Type", "image/jpeg")
	http.ServeFile(w, r, file)
}
